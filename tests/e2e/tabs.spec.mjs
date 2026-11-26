/**
 * Tabs, end to end: tabs remember where you were (Help page #163, Settings sub-page), an Editor tab
 * with no file can be switched to (#164), a second tab of the same view stays active, closing a tab
 * shows the tab that takes its place, and one file never gets two tabs. Each test gets its own app
 * and project.
 */
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDesktop, ensureFrontend, launchApp, closeApp, createProject, openProject, stopProcessTree, sleep,
} from '../../scripts/lib/electron-app.mjs';

const test = base.extend({
  tabs: async ({}, use) => {
    if (!process.env.E2E_SKIP_BUILD) buildDesktop();
    const frontend = await ensureFrontend({ preview: Boolean(process.env.E2E_PREVIEW) });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vw-e2e-tabs-'));
    const { app, win } = await launchApp({ profileDir: path.join(tmp, 'profile') });
    const projectPath = path.join(tmp, 'Tabs Project');
    await createProject(win, { name: 'Tabs Project', description: 'Tab tests' }, projectPath);
    await fs.mkdir(path.join(projectPath, 'nodes'), { recursive: true });
    for (const [file, id, title] of [['alpha.md', 'page-alpha', 'Alpha'], ['beta.md', 'page-beta', 'Beta']]) {
      await fs.writeFile(
        path.join(projectPath, 'nodes', file),
        `---\nid: ${id}\ntitle: ${title}\ntype: node\nlinks: []\n---\n\n# ${title}\n\n${title} page text.\n`
      );
    }
    try {
      await use({ app, win, tmp, projectPath });
    } finally {
      await closeApp(app);
      if (frontend) stopProcessTree(frontend.pid);
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  },
});

const openNav = (win, name) => win.getByRole('link', { name, exact: true }).first().click();
const tab = (win, title) => win.getByRole('tab', { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
/** Click a tab on its title (the centre of a short tab can be its close button). */
const clickTab = (win, title) => tab(win, title).locator('span').first().click();
const selectedTab = (win) => win.locator('[role="tab"][aria-selected="true"]');
const editorText = (win) => win.locator('.monaco-editor .view-lines').first();

/** Open a file from the Editor's file tree (the pages live in nodes/). */
async function openFromTree(win, fileName) {
  const file = win.getByText(fileName, { exact: true }).first();
  if (!(await file.isVisible().catch(() => false))) {
    await win.getByText('nodes', { exact: true }).first().click();
  }
  await file.click();
}

test.describe('Tabs', () => {
  test('the Help tab keeps the page you picked and is named after it (#163)', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await openNav(win, 'Help');
    await win.getByRole('button', { name: 'Graph View', exact: true }).click();
    await expect(tab(win, 'Help - Graph View')).toHaveAttribute('aria-selected', 'true');
    await expect(win.locator('#help-doc-container h1').first()).toHaveText('Graph View');

    await openNav(win, 'Dashboard');
    await clickTab(win, 'Help - Graph View');
    await expect(win.locator('#help-doc-container h1').first()).toHaveText('Graph View');

    // The sidebar's Help link also returns to it
    await openNav(win, 'Dashboard');
    await openNav(win, 'Help');
    await expect(win.locator('#help-doc-container h1').first()).toHaveText('Graph View');
  });

  test('the Help tab keeps how far down the page you scrolled', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await openNav(win, 'Help');
    await win.getByRole('button', { name: 'Graph View', exact: true }).click();
    await expect(win.locator('#help-doc-container h1').first()).toHaveText('Graph View');
    const container = win.locator('#help-doc-container');
    const scrollTop = () => container.evaluate((el) => el.scrollTop);
    await container.hover();
    await win.mouse.wheel(0, 1500);
    await expect.poll(scrollTop).toBeGreaterThan(1000);
    const place = await scrollTop();
    await sleep(500); // the place is saved shortly after scrolling stops

    await openNav(win, 'Dashboard');
    await clickTab(win, 'Help - Graph View');
    await expect(win.locator('#help-doc-container h1').first()).toHaveText('Graph View');
    await expect.poll(scrollTop).toBe(place);

    // Another page opens at the top, and coming back to it doesn't use the old page's place
    await win.getByRole('button', { name: 'Editor', exact: true }).first().click();
    await expect(tab(win, 'Help - Editor')).toHaveCount(1);
    await expect.poll(scrollTop).toBe(0);
    await openNav(win, 'Dashboard');
    await clickTab(win, 'Help - Editor');
    await sleep(500);
    expect(await scrollTop()).toBe(0);
  });

  test('an Editor tab with no file can be switched to (#164)', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    // Opening a project seeds README.md, so remove it afterwards
    await openProject(win, projectPath);
    await fs.rm(path.join(projectPath, 'README.md'), { force: true });

    // No README: the Editor link opens an empty Editor tab
    await openNav(win, 'Editor');
    await expect(tab(win, 'Editor')).toHaveAttribute('aria-selected', 'true');
    await expect(win.getByText('No File Open')).toBeVisible();

    // A file opened from an empty Editor tab takes that tab over
    await openFromTree(win, 'alpha.md');
    await expect(tab(win, 'alpha.md')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(win, 'Editor')).toHaveCount(0);
    await expect(editorText(win)).toContainText('Alpha page text.');

    // A second, empty Editor tab, then back and forth between the two
    await openNav(win, 'Editor');
    await expect(tab(win, 'Editor')).toHaveAttribute('aria-selected', 'true');
    await expect(win.getByText('No File Open')).toBeVisible();
    await clickTab(win, 'alpha.md');
    await expect(tab(win, 'alpha.md')).toHaveAttribute('aria-selected', 'true');
    await expect(editorText(win)).toContainText('Alpha page text.');
    await clickTab(win, 'Editor');
    await expect(tab(win, 'Editor')).toHaveAttribute('aria-selected', 'true');
    await expect(win.getByText('No File Open')).toBeVisible();
  });

  test('the Editor link opens README in its own tab', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await fs.writeFile(path.join(projectPath, 'README.md'), '# Tabs Project\n\nReadme text.\n');
    await openNav(win, 'Editor');
    await expect(tab(win, 'README.md')).toHaveAttribute('aria-selected', 'true');
    await expect(editorText(win)).toContainText('Readme text.');
    await expect(tab(win, 'Editor')).toHaveCount(0);

    await openFromTree(win, 'alpha.md');
    await expect(tab(win, 'alpha.md')).toHaveAttribute('aria-selected', 'true');
    await expect(editorText(win)).toContainText('Alpha page text.');
    await clickTab(win, 'README.md');
    await expect(editorText(win)).toContainText('Readme text.');

    // Going back to the Editor link switches to the README tab rather than adding an empty one
    await openNav(win, 'Dashboard');
    await openNav(win, 'Editor');
    await expect(tab(win, 'README.md')).toHaveAttribute('aria-selected', 'true');
    await expect(win.locator('[role="tab"]')).toHaveCount(3);
  });

  test('the Settings tab keeps its sub-page', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await openNav(win, 'Settings');
    await openNav(win, 'Appearance');
    await expect.poll(() => win.url()).toContain('#/settings/appearance');
    await openNav(win, 'Dashboard');
    await clickTab(win, 'Settings');
    await expect.poll(() => win.url()).toContain('#/settings/appearance');
  });

  test('two Graph tabs each stay active and keep their own sub-view', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await win.getByRole('button', { name: 'New tab' }).click();
    await expect(tab(win, 'Graph - Mind Map')).toHaveAttribute('aria-selected', 'true');
    await win.getByRole('button', { name: 'Outline', exact: true }).first().click();
    await expect(tab(win, 'Graph - Outline')).toHaveAttribute('aria-selected', 'true');

    await win.getByRole('button', { name: 'New tab' }).click();
    await expect(tab(win, 'Graph - Mind Map')).toHaveAttribute('aria-selected', 'true');
    await sleep(1000);
    // Still the new tab, and the first one still shows the Outline
    await expect(tab(win, 'Graph - Mind Map')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(win, 'Graph - Outline')).toHaveCount(1);

    await clickTab(win, 'Graph - Outline');
    await expect(tab(win, 'Graph - Outline')).toHaveAttribute('aria-selected', 'true');
    await expect(win.locator('.react-flow')).toHaveCount(0);
    await clickTab(win, 'Graph - Mind Map');
    await expect(tab(win, 'Graph - Mind Map')).toHaveAttribute('aria-selected', 'true');
    await expect(win.locator('.react-flow').first()).toBeVisible();
    await expect(tab(win, 'Graph - Outline')).toHaveCount(1);

    // A view shortcut from another tab doesn't rename that tab
    await openNav(win, 'Dashboard');
    await expect(tab(win, 'Dashboard')).toHaveCount(1);
  });

  test('closing the active tab shows the tab that takes its place', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await openNav(win, 'Tasks');
    await openNav(win, 'Settings');
    await clickTab(win, 'Tasks');
    await expect.poll(() => win.url()).toContain('#/tasks');
    await win.getByRole('button', { name: 'Close Tasks' }).click();
    await expect(selectedTab(win)).toHaveAttribute('title', 'Settings');
    await expect.poll(() => win.url()).toContain('#/settings');
  });

  test('tabs can be used from the keyboard', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await openNav(win, 'Settings');
    await tab(win, 'Settings').focus();
    await win.keyboard.press('ArrowLeft');
    await win.keyboard.press('Enter');
    await expect(tab(win, 'Dashboard')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => win.url()).toContain('#/dashboard');
  });

  test('a page opened from the Graph and from the file tree shares one tab', async ({ tabs }) => {
    const { win, projectPath } = tabs;
    await openProject(win, projectPath);
    await openNav(win, 'Editor');
    await openFromTree(win, 'alpha.md');
    await expect(tab(win, 'alpha.md')).toHaveAttribute('aria-selected', 'true');

    await openNav(win, 'Graph');
    const node = win.locator('.react-flow__node[data-id="nodes/alpha.md"]');
    await node.waitFor({ timeout: 30_000 });
    await node.click({ button: 'right' });
    await win.locator('.vw-node-context-menu').getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(selectedTab(win)).toHaveAttribute('title', 'alpha.md');
    await expect(tab(win, 'alpha.md')).toHaveCount(1);
  });

  test('switching projects shows the restored active tab', async ({ tabs }) => {
    const { win, projectPath, tmp } = tabs;
    const other = path.join(tmp, 'Other Project');
    await createProject(win, { name: 'Other Project' }, other);
    await openProject(win, projectPath);
    await openNav(win, 'Settings');
    await tab(win, 'Dashboard').getByRole('button', { name: /^Close/ }).click();
    await expect(tab(win, 'Settings')).toHaveAttribute('aria-selected', 'true');

    await openProject(win, other);
    await openProject(win, projectPath);
    await expect(tab(win, 'Settings')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => win.url()).toContain('#/settings');
  });
});
