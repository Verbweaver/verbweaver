/**
 * Shared helpers for scripts and tests that drive the Verbweaver desktop app with Playwright
 * (scripts/help-screenshots/capture.mjs, scripts/compiler-stress/stress.mjs, tests/e2e).
 *
 * The app runs in development mode: Electron loads the renderer from a frontend server on :3000
 * (the Vite dev server, or `vite preview` of a built frontend) and starts the backend from the
 * repo's Python venv. Each launch uses a throwaway profile, so real settings are never touched.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(REPO, 'package.json'));
export const { _electron } = require('playwright-core');
const electronPath = require('electron');

export const FRONTEND_URL = 'http://localhost:3000';
export const IS_WINDOWS = process.platform === 'win32';

// Commits made in sample projects use a made-up author, and no personal git config is read
export const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Sam Writer',
  GIT_AUTHOR_EMAIL: 'sam@example.com',
  GIT_COMMITTER_NAME: 'Sam Writer',
  GIT_COMMITTER_EMAIL: 'sam@example.com',
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: '1',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reuse a frontend server on :3000, or start one. `preview: true` serves the built frontend
 * (frontend/dist, from `npm run build:frontend`) instead of the dev server, which is faster in CI.
 * Returns the child process to stop later, or null if one was already running.
 */
export async function ensureFrontend({ preview = false, log = () => {} } = {}) {
  if (await isUp(FRONTEND_URL)) {
    log(`Reusing frontend server at ${FRONTEND_URL}`);
    return null;
  }
  log(preview ? 'Starting frontend preview server...' : 'Starting frontend dev server...');
  const npmArgs = preview
    ? ['run', 'preview', '--', '--port', '3000', '--strictPort']
    : ['run', 'dev', '--', '--strictPort'];
  const child = spawn('npm', npmArgs, {
    cwd: path.join(REPO, 'frontend'),
    stdio: 'ignore',
    detached: !IS_WINDOWS,
    shell: IS_WINDOWS,
  });
  for (let i = 0; i < 90; i++) {
    if (await isUp(FRONTEND_URL)) return child;
    await sleep(1000);
  }
  throw new Error(`Frontend server did not start on ${FRONTEND_URL}`);
}

export function buildDesktop({ log = () => {} } = {}) {
  log('Building desktop main/preload...');
  execFileSync('npx', ['--no-install', 'electron-vite', 'build'], {
    cwd: path.join(REPO, 'desktop'),
    stdio: 'inherit',
    shell: IS_WINDOWS,
  });
}

export function stopProcessTree(pid) {
  try {
    if (IS_WINDOWS) execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid);
  } catch {}
}

export function git(cwd, ...gitArgs) {
  execFileSync('git', gitArgs, { cwd, stdio: 'ignore', env: { ...process.env, ...GIT_ENV } });
}

/**
 * Launch the desktop app with an isolated profile under `profileDir`.
 * Headless on Linux unless `headed`; other platforms always show the window.
 * Returns { app, win } where win is the app window (not DevTools), sized to `size`.
 */
export async function launchApp({ profileDir, headed = false, size = { width: 1440, height: 900 }, extraArgs = [] }) {
  const headless = !headed && process.platform === 'linux';
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [
      ...(headless ? ['--ozone-platform=headless'] : []),
      ...(process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : []),
      ...extraArgs,
      `--user-data-dir=${profileDir}`,
      // The desktop folder, as in `electron-vite dev`: its package.json points at dist/main/main.js,
      // and the app finds docs/ and templates relative to it
      path.join(REPO, 'desktop'),
    ],
    cwd: path.join(REPO, 'desktop'),
    env: { ...process.env, ...GIT_ENV, NODE_ENV: 'development' },
    timeout: 90_000,
  });
  // Pick the app window, not DevTools (which dev mode opens alongside it)
  let win = null;
  for (let i = 0; i < 120 && !win; i++) {
    win = app.windows().find((w) => w.url().startsWith(FRONTEND_URL)) || null;
    if (!win) await sleep(500);
  }
  if (!win) throw new Error('The app window did not open');
  await app.evaluate(({ BrowserWindow }, s) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.webContents.closeDevTools();
    w.setContentSize(s.width, s.height);
  }, size);
  await win.waitForLoadState('domcontentloaded');
  await sleep(3000);
  return { app, win };
}

/** Close the app (which also stops the backend it started); force it if that hangs. */
export async function closeApp(app, { log = () => {} } = {}) {
  const closed = await Promise.race([app.close().then(() => true, () => true), sleep(15_000).then(() => false)]);
  if (!closed) {
    log('App did not close in time; stopping it.');
    try { app.process().kill('SIGKILL'); } catch {}
  }
}

/** Create a project through the app (as the New Project dialog does), so templates are seeded. */
export async function createProject(win, { name, description = '' }, projectPath) {
  await win.evaluate(
    ([n, p, d]) => window.electronAPI.createProject(n, p, d),
    [name, projectPath, description]
  );
  try {
    await fs.access(path.join(projectPath, '.git'));
  } catch {
    git(projectPath, 'init', '-q', '-b', 'main');
  }
}

export async function openProject(win, projectPath, settleMs = 4000) {
  await win.evaluate((p) => window.electronAPI.openProject(p), projectPath);
  await win.waitForLoadState('domcontentloaded');
  await sleep(settleMs);
}

/** Recursively copy a folder. */
export async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}
