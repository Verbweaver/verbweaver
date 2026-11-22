/**
 * Settings view, end to end (#107, #108): Appearance theme export, import, Save as Custom and
 * swatches; Profile Data Locations defaults and the restart prompt.
 * One app and project for the file.
 */
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDesktop, ensureFrontend, launchApp, closeApp, createProject, openProject, stopProcessTree, sleep,
} from '../../scripts/lib/electron-app.mjs';

const THEME_KEYS = [
  'background', 'foreground', 'primary', 'primaryForeground', 'secondary', 'secondaryForeground',
  'accent', 'accentForeground', 'muted', 'mutedForeground', 'border', 'input', 'ring', 'card',
  'cardForeground', 'popover', 'popoverForeground',
];
const cssName = (k) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`;

const test = base.extend({
  settings: [async ({}, use) => {
    if (!process.env.E2E_SKIP_BUILD) buildDesktop();
    const frontend = await ensureFrontend({ preview: Boolean(process.env.E2E_PREVIEW) });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vw-e2e-settings-'));
    const downloads = path.join(tmp, 'downloads');
    await fs.mkdir(downloads, { recursive: true });
    const profileDir = path.join(tmp, 'profile');
    const { app, win } = await launchApp({ profileDir });
    await app.evaluate(({ session }, [dir, sep]) => {
      session.defaultSession.on('will-download', (_e, item) => item.setSavePath(dir + sep + item.getFilename()));
    }, [downloads, path.sep]);
    const projectPath = path.join(tmp, 'Settings Project');
    await createProject(win, { name: 'Settings Project', description: 'Settings tests' }, projectPath);
    await openProject(win, projectPath);
    try {
      await use({ app, win, tmp, profileDir, downloads });
    } finally {
      await closeApp(app);
      if (frontend) stopProcessTree(frontend.pid);
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }, { scope: 'worker', timeout: 5 * 60_000 }],
});

async function goTo(win, hash) {
  await win.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(500);
}

async function openAppearance(win, theme) {
  await goTo(win, '#/settings/appearance');
  await win.locator('#theme-select').selectOption(theme);
  await sleep(500);
}

/** The theme colours the page is actually using, read from CSS. */
function computedVars(win) {
  return win.evaluate(([keys, names]) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(keys.map((k, i) => [k, style.getPropertyValue(names[i]).trim()]));
  }, [THEME_KEYS, THEME_KEYS.map(cssName)]);
}

function persistedCustomVars(win) {
  return win.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const v = JSON.parse(localStorage.getItem(localStorage.key(i)) || 'null');
      if (v?.state && 'customVars' in v.state) return v.state.customVars;
    }
    return null;
  });
}

async function importFile(win, filePath) {
  const chooser = win.waitForEvent('filechooser');
  await win.getByRole('button', { name: 'Import Theme' }).click();
  await (await chooser).setFiles(filePath);
  await sleep(500);
}

test.describe('Settings', () => {
  test('#108: Export Theme saves every colour of a built-in theme', async ({ settings }) => {
    const { win, downloads } = settings;
    await openAppearance(win, 'dark');
    const file = path.join(downloads, 'verbweaver-theme.json');
    await fs.rm(file, { force: true });
    await win.getByRole('button', { name: 'Export Theme' }).click();
    await expect.poll(() => fs.access(file).then(() => true, () => false)).toBe(true);
    const exported = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(Object.keys(exported.variables).sort()).toEqual([...THEME_KEYS].sort());
    expect(exported.variables).toEqual(await computedVars(win));
  });

  test('swatches show their own colour, including unsaved edits', async ({ settings }) => {
    const { win } = settings;
    await openAppearance(win, 'dark');
    const bg = (k) => win.getByTestId(`swatch-${k}`).evaluate((el) => getComputedStyle(el).backgroundColor);
    const probe = (hsl) => win.evaluate((v) => {
      const el = document.createElement('div');
      el.style.backgroundColor = `hsl(${v})`;
      document.body.appendChild(el);
      const c = getComputedStyle(el).backgroundColor;
      el.remove();
      return c;
    }, hsl);
    const vars = await computedVars(win);
    expect(await bg('primaryForeground')).toBe(await probe(vars.primaryForeground));
    await win.locator('#theme-var-primary').fill('120 60% 40%');
    expect(await bg('primary')).toBe(await probe('120 60% 40%'));
  });

  test('Save as Custom keeps the rest of the starting theme', async ({ settings }) => {
    const { win } = settings;
    await openAppearance(win, 'dark');
    const dark = await computedVars(win);
    await win.locator('#theme-var-ring').fill('300 70% 50%');
    await win.getByRole('button', { name: 'Save as Custom' }).click();
    await sleep(500);
    await expect(win.locator('#theme-select')).toHaveValue('custom');
    const saved = await persistedCustomVars(win);
    expect(Object.keys(saved).sort()).toEqual([...THEME_KEYS].sort());
    const now = await computedVars(win);
    expect(now.ring).toBe('300 70% 50%');
    expect(now.background).toBe(dark.background);
    expect(now.foreground).toBe(dark.foreground);
  });

  test('Import Theme reports bad files and fills in missing colours', async ({ settings }) => {
    const { win, tmp } = settings;
    await openAppearance(win, 'dark');
    const before = await computedVars(win);

    const notJson = path.join(tmp, 'not-a-theme.json');
    await fs.writeFile(notJson, 'this is not json');
    await importFile(win, notJson);
    await expect(win.getByRole('alert')).toContainText("isn't a theme file");
    await expect(win.locator('#theme-select')).toHaveValue('dark');

    const noColours = path.join(tmp, 'no-colours.json');
    await fs.writeFile(noColours, JSON.stringify({ name: 'x', variables: { nope: '1 2% 3%' } }));
    await importFile(win, noColours);
    await expect(win.getByRole('alert')).toContainText('has no theme colours');
    await expect(win.locator('#theme-select')).toHaveValue('dark');
    expect(await computedVars(win)).toEqual(before);

    const partial = path.join(tmp, 'partial.json');
    await fs.writeFile(partial, JSON.stringify({ name: 'shared', variables: { primary: '10 80% 50%' } }));
    await importFile(win, partial);
    await expect(win.getByRole('status').filter({ hasText: 'Theme imported' })).toBeVisible();
    await expect(win.locator('#theme-select')).toHaveValue('custom');
    const saved = await persistedCustomVars(win);
    expect(Object.keys(saved).sort()).toEqual([...THEME_KEYS].sort());
    const now = await computedVars(win);
    expect(now.primary).toBe('10 80% 50%');
    expect(now.background).toBe(before.background);
  });

  test('#107: Data Locations show real defaults and offer a restart after changes', async ({ settings }) => {
    const { app, win, tmp, profileDir } = settings;
    // Record relaunch/quit instead of restarting the app under test
    await app.evaluate(({ app: electronApp }) => {
      globalThis.__e2eCalls = [];
      globalThis.__e2eOrig = { relaunch: electronApp.relaunch, quit: electronApp.quit };
      electronApp.relaunch = () => { globalThis.__e2eCalls.push('relaunch'); };
      electronApp.quit = () => { globalThis.__e2eCalls.push('quit'); };
    });
    try {
      await goTo(win, '#/settings');
      const gitRoot = win.locator('#data-git-root');
      const notice = win.getByRole('status').filter({ hasText: 'Restart Verbweaver' });
      if (!process.env.GIT_PROJECTS_ROOT) {
        await expect(gitRoot).toHaveAttribute('placeholder', `Default: ${path.join(profileDir, 'git-repos')}`);
      }
      if (!process.env.DATABASE_URL) {
        await expect(win.locator('#data-db-url')).toHaveAttribute('placeholder', new RegExp(`${path.join(profileDir, 'verbweaver.db').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}$`));
      }
      await expect(notice).toHaveCount(0);

      // Saving without changes: no restart needed
      await win.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(win.getByText('Saved', { exact: true })).toBeVisible();
      await expect(notice).toHaveCount(0);

      // Change the location: the notice appears and stays after leaving Settings
      await gitRoot.fill(path.join(tmp, 'other-git-root'));
      await win.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(notice).toBeVisible();
      await goTo(win, '#/settings/appearance');
      await goTo(win, '#/settings');
      await expect(notice).toBeVisible();
      await expect(gitRoot).toHaveValue(path.join(tmp, 'other-git-root'));

      await notice.getByRole('button', { name: 'Restart now' }).click();
      await expect.poll(() => app.evaluate(() => globalThis.__e2eCalls)).toEqual(['relaunch', 'quit']);

      // Changing it back to the default: no restart needed any more
      await gitRoot.fill('');
      await win.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(notice).toHaveCount(0);
    } finally {
      await app.evaluate(({ app: electronApp }) => {
        Object.assign(electronApp, globalThis.__e2eOrig);
      });
    }
  });
});
