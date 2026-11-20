#!/usr/bin/env node
/**
 * Captures the screenshots used by the in-app Help guides (docs/images/*.png).
 *
 * It builds the desktop app, starts the frontend dev server if needed, launches Electron with an
 * isolated profile (your real Verbweaver settings and recent projects are untouched), creates the
 * sample project from ./sample-project in a temp folder, and screenshots each view.
 *
 * Usage (from the repo root):
 *   node scripts/help-screenshots/capture.mjs [--headed] [--only=name1,name2] [--out=docs/images]
 *
 * See ./README.md for prerequisites.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(REPO, 'package.json'));
const { _electron } = require('playwright-core');
const electronPath = require('electron');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const OUT_DIR = path.resolve(REPO, typeof args.out === 'string' ? args.out : 'docs/images');
const ONLY = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const FRONTEND_URL = 'http://localhost:3000';
const WINDOW = { width: 1440, height: 900 };
const PROJECT_NAME = 'The Emberfall Chronicles';

// Commits in the sample project use a made-up author, and no personal git config is read,
// so nothing from the machine running the script ends up in the screenshots
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Sam Writer',
  GIT_AUTHOR_EMAIL: 'sam@example.com',
  GIT_COMMITTER_NAME: 'Sam Writer',
  GIT_COMMITTER_EMAIL: 'sam@example.com',
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: '1',
};

const IS_WINDOWS = process.platform === 'win32';
// Off-screen rendering is only available on Linux; elsewhere the window shows while capturing
const HEADLESS = !args.headed && process.platform === 'linux';

const log = (...m) => console.log('[help-screenshots]', ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Environment: desktop build + frontend dev server
// ---------------------------------------------------------------------------------------------

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureFrontend() {
  if (await isUp(FRONTEND_URL)) {
    log(`Reusing frontend dev server at ${FRONTEND_URL}`);
    return null;
  }
  log('Starting frontend dev server...');
  const child = spawn('npm', ['run', 'dev', '--', '--strictPort'], {
    cwd: path.join(REPO, 'frontend'),
    stdio: 'ignore',
    detached: !IS_WINDOWS,
    shell: IS_WINDOWS,
  });
  for (let i = 0; i < 60; i++) {
    if (await isUp(FRONTEND_URL)) return child;
    await sleep(1000);
  }
  throw new Error(`Frontend dev server did not start on ${FRONTEND_URL}`);
}

function buildDesktop() {
  log('Building desktop main/preload...');
  execFileSync('npx', ['--no-install', 'electron-vite', 'build'], {
    cwd: path.join(REPO, 'desktop'),
    stdio: 'inherit',
    shell: IS_WINDOWS,
  });
}

function stopProcessTree(pid) {
  try {
    if (IS_WINDOWS) execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid);
  } catch {}
}

// ---------------------------------------------------------------------------------------------
// Sample project
// ---------------------------------------------------------------------------------------------

const isoDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/** Copy sample-project/nodes into the project, replacing {{date:+N}} with dates relative to today. */
async function copyNodes(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyNodes(from, to);
    } else {
      const text = await fs.readFile(from, 'utf8');
      await fs.writeFile(to, text.replace(/\{\{date:([+-]\d+)\}\}/g, (_, n) => isoDate(Number(n))));
    }
  }
}

function git(cwd, ...gitArgs) {
  execFileSync('git', gitArgs, { cwd, stdio: 'ignore', env: { ...process.env, ...GIT_ENV } });
}

/** Hand-placed Mind Map positions for pages, written into their front matter (used in Rigid mode). */
async function applyMindMapPositions(projectPath) {
  const config = path.join(HERE, 'sample-project', 'config', 'mind-map.json');
  const { positions } = JSON.parse(await fs.readFile(config, 'utf8'));
  for (const [rel, { x, y }] of Object.entries(positions)) {
    const file = path.join(projectPath, rel);
    const text = await fs.readFile(file, 'utf8');
    // Insert before the closing '---' of the front matter
    await fs.writeFile(file, text.replace(/\n---\n/, `\nposition:\n  x: ${x}\n  y: ${y}\n---\n`));
  }
}

async function populateProject(projectPath) {
  const nodesDir = path.join(projectPath, 'nodes');
  await copyNodes(path.join(HERE, 'sample-project', 'nodes', 'World'), path.join(nodesDir, 'World'));
  try {
    await fs.access(path.join(projectPath, '.git'));
  } catch {
    git(projectPath, 'init', '-q', '-b', 'main');
  }
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-q', '-m', 'Build the world: characters, places and factions');
  await copyNodes(path.join(HERE, 'sample-project', 'nodes', 'Story'), path.join(nodesDir, 'Story'));
  await applyMindMapPositions(projectPath);
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-q', '-m', 'Draft chapters 1 to 5');
}

/** One uncommitted edit, made after the app has opened (and committed) the project. */
async function makeUncommittedEdit(projectPath) {
  const ch3 = path.join(projectPath, 'nodes', 'Story', 'Chapter 03 - The Storm.md');
  await fs.appendFile(ch3, '\nThe storm breaks over Saltmarsh as Mira and Rowan reach the harbour.\n');
}

// ---------------------------------------------------------------------------------------------
// App helpers
// ---------------------------------------------------------------------------------------------

async function settle(win, ms = 800) {
  await win.waitForLoadState('domcontentloaded');
  await sleep(ms);
}

async function shot(win, name) {
  if (ONLY && !ONLY.has(name)) return;
  // Drop focus rings and hover states so shots are clean
  await win.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await win.mouse.move(WINDOW.width - 2, WINDOW.height - 2);
  // Wait for notifications (e.g. "Layout applied") to disappear
  await win.locator('[role="status"]').first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await sleep(300);
  const file = path.join(OUT_DIR, `${name}.png`);
  await win.screenshot({ path: file });
  log(`Saved ${path.relative(REPO, file)}`);
}

async function openSidebar(win, label) {
  await win.getByRole('link', { name: label, exact: true }).first().click();
  await settle(win);
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  buildDesktop();
  const frontend = await ensureFrontend();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vw-help-shots-'));
  const projectPath = path.join(tmp, 'Emberfall Chronicles');
  await fs.mkdir(OUT_DIR, { recursive: true });

  const app = await _electron.launch({
    executablePath: electronPath,
    args: [
      ...(HEADLESS ? ['--ozone-platform=headless'] : []),
      // A throwaway profile: your real settings and recent projects are never touched
      `--user-data-dir=${path.join(tmp, 'profile')}`,
      // The desktop folder, as in `electron-vite dev`: its package.json points at dist/main/main.js,
      // and the app finds docs/ and templates relative to it
      path.join(REPO, 'desktop'),
    ],
    cwd: path.join(REPO, 'desktop'),
    env: { ...process.env, ...GIT_ENV, NODE_ENV: 'development' },
    timeout: 90_000,
  });

  try {
    // Pick the app window, not DevTools (which dev mode opens alongside it)
    let win = null;
    for (let i = 0; i < 120 && !win; i++) {
      win = app.windows().find((w) => w.url().startsWith(FRONTEND_URL)) || null;
      if (!win) await sleep(500);
    }
    if (!win) throw new Error('The app window did not open');
    await app.evaluate(({ BrowserWindow }, size) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.webContents.closeDevTools();
      w.setContentSize(size.width, size.height);
    }, WINDOW);
    await settle(win, 3000);

    log('Creating sample project...');
    await win.evaluate(
      ([name, p]) => window.electronAPI.createProject(name, p, 'A fantasy novel and its world.'),
      [PROJECT_NAME, projectPath]
    );
    await populateProject(projectPath);
    await win.evaluate((p) => window.electronAPI.openProject(p), projectPath);
    await settle(win, 4000);
    await makeUncommittedEdit(projectPath);

    try {
      await captureAll(win);
    } catch (err) {
      const debugShot = path.join(os.tmpdir(), 'vw-help-shots-error.png');
      await win.screenshot({ path: debugShot }).catch(() => {});
      log(`Failed; screenshot of the app at that moment: ${debugShot}`);
      throw err;
    }
  } finally {
    // Closing normally also stops the backend the app started; force it if that hangs
    const closed = await Promise.race([app.close().then(() => true, () => true), sleep(15_000).then(() => false)]);
    if (!closed) {
      log('App did not close in time; stopping it.');
      try { app.process().kill('SIGKILL'); } catch {}
    }
    if (frontend) stopProcessTree(frontend.pid);
    if (!args.keep) await fs.rm(tmp, { recursive: true, force: true });
    else log(`Kept temp folder: ${tmp}`);
  }
}

async function clickButton(win, name, wait = 1200) {
  await win.getByRole('button', { name, exact: true }).first().click();
  await settle(win, wait);
}

async function fitView(win) {
  const fit = win.locator('.react-flow__controls-fitview').first();
  if (await fit.count()) {
    await fit.click();
    await sleep(800);
  }
}

async function importJson(win, fixture) {
  await win.locator('input[type=file][accept*="json"]').first()
    .setInputFiles(path.join(HERE, 'sample-project', 'config', fixture));
  await settle(win, 1500);
}

async function zoomOut(win, steps = 1) {
  const btn = win.locator('.react-flow__controls-zoomout').first();
  for (let i = 0; i < steps && (await btn.count()); i++) {
    await btn.click();
    await sleep(400);
  }
}

/** Pan the React Flow canvas by dragging an empty spot of it (keeps content clear of side panels). */
async function panBy(win, dx, dy = 0) {
  const start = await win.evaluate(() => {
    for (let y = window.innerHeight - 60; y > 60; y -= 40) {
      for (let x = Math.round(window.innerWidth / 2); x > 300; x -= 40) {
        const el = document.elementFromPoint(x, y);
        if (el && el.classList.contains('react-flow__pane')) return { x, y };
      }
    }
    return null;
  });
  if (!start) return;
  await win.mouse.move(start.x, start.y);
  await win.mouse.down();
  await win.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
  await win.mouse.up();
  await sleep(500);
}

async function clickText(win, text, wait = 800) {
  await win.getByText(text, { exact: true }).first().click();
  await settle(win, wait);
}

async function captureAll(win) {
  // Version Control first, while the only uncommitted change is the Chapter 3 edit
  await openSidebar(win, 'Version Control');
  await settle(win, 1500);
  await shot(win, 'version-control');

  // --- Graph -----------------------------------------------------------------------------------
  await openSidebar(win, 'Graph');
  await settle(win, 2500);
  // Fold the Options tray so it doesn't cover the top-left of the map
  await win.getByRole('button', { name: /^Options/ }).first().click();
  await sleep(400);
  await fitView(win);
  await zoomOut(win, 1);
  await panBy(win, -90);
  await shot(win, 'graph-mind-map');

  await clickButton(win, 'Outline');
  await clickButton(win, 'Expand all');
  await shot(win, 'graph-outline');

  await clickButton(win, 'Group', 1500);
  await importJson(win, 'group-view.json');
  await fitView(win);
  await zoomOut(win, 2);
  await panBy(win, -90, 40);
  await shot(win, 'graph-group');

  await clickButton(win, 'Progression', 1500);
  await importJson(win, 'progression.json');
  await shot(win, 'graph-progression');

  // --- Tasks -----------------------------------------------------------------------------------
  await openSidebar(win, 'Tasks');
  await settle(win, 1500);
  await clickButton(win, 'Board');
  await shot(win, 'tasks-board');
  await clickButton(win, 'Calendar', 1500);
  await shot(win, 'tasks-calendar');
  await clickButton(win, 'To-Do');
  await shot(win, 'tasks-todo');
  await clickButton(win, 'Charts', 1500);
  await shot(win, 'tasks-charts');

  // --- Compiler --------------------------------------------------------------------------------
  await openSidebar(win, 'Compiler');
  await settle(win, 2500);
  // Folders load their contents when expanded, and Select All only selects loaded files
  for (let i = 0; i < 3; i++) await clickButton(win, 'Expand All', 1000);
  await clickButton(win, 'Select All', 1500);
  await shot(win, 'compiler');

  // --- Editor: open Chapter 3 from the file tree -------------------------------------------------
  await openSidebar(win, 'Editor');
  await settle(win, 1500);
  await clickText(win, 'nodes');
  await clickText(win, 'Story');
  await clickText(win, 'Chapter 03 - The Storm.md', 2000);
  await shot(win, 'editor');

  // --- Settings --------------------------------------------------------------------------------
  await openSidebar(win, 'Settings');
  for (const [label, name] of [
    ['Profile', 'settings-profile'],
    ['Appearance', 'settings-appearance'],
    ['Project', 'settings-project'],
    ['Collaboration', 'settings-collaboration'],
    ['Templates', 'settings-templates'],
    ['Dependencies', 'settings-dependencies'],
  ]) {
    await openSidebar(win, label);
    await settle(win, 1200);
    await shot(win, name);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
