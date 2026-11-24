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
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPO, buildDesktop as buildDesktopApp, ensureFrontend as ensureFrontendServer, launchApp, closeApp,
  createProject as createAppProject, stopProcessTree, git as gitIn, sleep,
} from '../lib/electron-app.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const OUT_DIR = path.resolve(REPO, typeof args.out === 'string' ? args.out : 'docs/images');
const ONLY = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const WINDOW = { width: 1440, height: 900 };
// Sample projects (folders next to this script): a fantasy novel for most views, and a small
// plant growth study for the Mind Map (a simpler map) and the Progression chart
const NOVEL = { name: 'The Emberfall Chronicles', folder: 'Emberfall Chronicles', fixture: 'sample-project', description: 'A fantasy novel and its world.' };
const PLANT = { name: 'Plant Growth Study', folder: 'Plant Growth Study', fixture: 'sample-plant-study', description: 'A weekly plant growth experiment.' };


const log = (...m) => console.log('[help-screenshots]', ...m);

// ---------------------------------------------------------------------------------------------
// Environment: desktop build + frontend dev server
// ---------------------------------------------------------------------------------------------

const buildDesktop = () => buildDesktopApp({ log });
const ensureFrontend = () => ensureFrontendServer({ log });

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

const git = gitIn;

async function createProject(win, project, projectPath) {
  log(`Creating sample project "${project.name}"...`);
  await createAppProject(win, project, projectPath);
}

/** The novel is added in two commits, so Version Control has some history to show. */
async function populateNovel(projectPath) {
  const src = path.join(HERE, NOVEL.fixture, 'nodes');
  const nodesDir = path.join(projectPath, 'nodes');
  await copyNodes(path.join(src, 'World'), path.join(nodesDir, 'World'));
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-q', '-m', 'Build the world: characters, places and factions');
  await copyNodes(path.join(src, 'Story'), path.join(nodesDir, 'Story'));
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-q', '-m', 'Draft chapters 1 to 5');
}

async function populatePlantStudy(projectPath) {
  await copyNodes(path.join(HERE, PLANT.fixture, 'nodes'), path.join(projectPath, 'nodes'));
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-q', '-m', 'Weeks 1 to 6 of observations');
}

async function openProject(win, projectPath) {
  await win.evaluate((p) => window.electronAPI.openProject(p), projectPath);
  await settle(win, 4000);
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
  await fs.mkdir(OUT_DIR, { recursive: true });

  // A throwaway profile: your real settings and recent projects are never touched
  const { app, win } = await launchApp({ profileDir: path.join(tmp, 'profile'), headed: Boolean(args.headed), size: WINDOW });

  try {
    try {
      await captureAll(win, tmp);
    } catch (err) {
      const debugShot = path.join(os.tmpdir(), 'vw-help-shots-error.png');
      await win.screenshot({ path: debugShot }).catch(() => {});
      log(`Failed; screenshot of the app at that moment: ${debugShot}`);
      throw err;
    }
  } finally {
    // Closing normally also stops the backend the app started; force it if that hangs
    await closeApp(app, { log });
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

/** Load a config through the view's own Import JSON / Load Config file input. */
async function importJson(win, project, fixture) {
  await win.locator('input[type=file][accept*="json"]').first()
    .setInputFiles(path.join(HERE, project.fixture, 'config', fixture));
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

async function captureAll(win, tmp) {
  // --- The novel: every view except Progression ---------------------------------------------
  const novelPath = path.join(tmp, NOVEL.folder);
  await createProject(win, NOVEL, novelPath);
  await populateNovel(novelPath);
  await openProject(win, novelPath);
  await makeUncommittedEdit(novelPath);

  // Version Control first, while the only uncommitted change is the Chapter 3 edit
  await openSidebar(win, 'Version Control');
  await settle(win, 1500);
  await shot(win, 'version-control');

  // --- Graph -----------------------------------------------------------------------------------
  await openSidebar(win, 'Graph');
  await settle(win, 2500);

  await clickButton(win, 'Outline');
  await clickButton(win, 'Expand all');
  await shot(win, 'graph-outline');

  await clickButton(win, 'Group', 1500);
  await importJson(win, NOVEL, 'group-view.json');
  await fitView(win);
  await zoomOut(win, 2);
  // Low enough to clear the Options tray and the Groups list
  await panBy(win, -90, 90);
  await shot(win, 'graph-group');

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

  // --- The plant study: Mind Map and Progression --------------------------------------------------
  const plantPath = path.join(tmp, PLANT.folder);
  await createProject(win, PLANT, plantPath);
  await populatePlantStudy(plantPath);
  await openProject(win, plantPath);
  await openSidebar(win, 'Graph');
  await settle(win, 2500);
  await captureMindMap(win);
  await clickButton(win, 'Progression', 1500);
  await importJson(win, PLANT, 'progression.json');
  await shot(win, 'graph-progression');
}

async function captureMindMap(win) {
  await clickButton(win, 'Mind Map', 1500);
  // Fold the Options tray so it doesn't cover the top-left of the map, then use a built-in layout
  const options = win.getByRole('button', { name: /^Options/ }).first();
  if ((await options.getAttribute('aria-expanded')) === 'true') await options.click();
  await sleep(400);
  await win.getByRole('button', { name: new RegExp(`${args.layout || 'Top to Bottom'}$`) }).first().click();
  await settle(win, 2000);
  await fitView(win);
  await shot(win, 'graph-mind-map');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
