#!/usr/bin/env node
/**
 * Compiler stress test (issue #123): drives the desktop app's Compiler page through every case in
 * tests/compiler/cases.json, in every export format, the way a person would:
 *
 *   - choose the files and options (via Load Configuration, or the option checkboxes),
 *   - pick the format and template,
 *   - fill the template's variables (text, checkboxes, enum menus, Import CSV for lists,
 *     Edit Table > Import CSV for tables, the Per-Node Variables grid),
 *   - click Compile and Download, and keep the file the app produced.
 *
 * The outputs are then checked by backend/tests/test_compiler_templates.py --check-dir, which
 * applies the same checks as the backend tests and prints a case x format matrix.
 *
 * Usage (from the repo root; prerequisites as for scripts/help-screenshots):
 *   node scripts/compiler-stress/stress.mjs [--only=basics,loops] [--formats=markdown,pdf]
 *                                          [--out=folder] [--headed] [--keep] [--preview]
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO, buildDesktop, ensureFrontend, launchApp, closeApp, createProject, openProject,
  stopProcessTree, git, copyDir, sleep,
} from '../lib/electron-app.mjs';

const yaml = createRequire(path.join(REPO, 'desktop', 'package.json'))('js-yaml');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const log = (...m) => console.log('[compiler-stress]', ...m);

const CASES = JSON.parse(await fs.readFile(path.join(REPO, 'tests', 'compiler', 'cases.json'), 'utf8'));
const FIXTURE = path.join(REPO, 'tests', 'compiler', 'fixture');
export const FORMATS = [
  { id: 'markdown', button: /^Markdown/ },
  { id: 'html', button: /^HTML/ },
  { id: 'pdf', button: /^PDF/ },
  { id: 'docx', button: /^Word Document/ },
  { id: 'odt', button: /^OpenDocument/ },
  { id: 'epub', button: /^EPUB/ },
];
const ONLY = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const ONLY_FORMATS = typeof args.formats === 'string' ? new Set(args.formats.split(',')) : null;

// The Compiler page's option defaults; every case states all of them so cases don't leak into each other
const OPTION_DEFAULTS = {
  includeMetadata: true,
  includeToc: false,
  embedUploadedFiles: true,
  maxVariablePasses: 5,
  reprocessNodesInPasses: true,
  showUnresolvedMarkers: false,
};

// ---------------------------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------------------------

/** Fixture pages and uploads, plus every case template in every format folder. */
export async function populateProject(projectPath) {
  await copyDir(path.join(FIXTURE, 'nodes'), path.join(projectPath, 'nodes'));
  await copyDir(path.join(FIXTURE, 'uploads'), path.join(projectPath, 'uploads'));
  const src = path.join(FIXTURE, 'templates', 'compiler', 'markdown');
  for (const { id } of FORMATS) {
    const dest = path.join(projectPath, 'templates', 'compiler', id);
    await fs.mkdir(dest, { recursive: true });
    for (const f of await fs.readdir(src)) await fs.copyFile(path.join(src, f), path.join(dest, f));
  }
  git(projectPath, 'add', '-A');
  git(projectPath, 'commit', '-q', '-m', 'Compiler stress fixture');
}

/** A template's text with {% include_relative %} resolved, as the compiler does before reading its schema. */
async function resolvedTemplate(file) {
  const text = await fs.readFile(file, 'utf8');
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/{%\s*include_relative\s+([^}]+?)\s*%}/g)) {
    parts.push(text.slice(last, m.index));
    const inc = path.resolve(path.dirname(file), m[1]);
    parts.push(existsSync(inc) ? await resolvedTemplate(inc) : '');
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.join('');
}

export async function templateSchema(projectPath, fmt, template) {
  if (!template) return {};
  const text = await resolvedTemplate(path.join(projectPath, 'templates', 'compiler', fmt, template));
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const fm = m ? yaml.load(m[1]) || {} : {};
  return { variables: fm.variables || {}, nodeVariables: fm.nodeVariables || {} };
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

// ---------------------------------------------------------------------------------------------
// Compiler page helpers
// ---------------------------------------------------------------------------------------------

export async function openCompiler(win) {
  await win.getByRole('link', { name: 'Compiler', exact: true }).first().click();
  await win.getByRole('button', { name: /Compile and Download/ }).waitFor({ timeout: 30_000 });
  await sleep(1000);
}

async function writeTemp(tmp, name, content) {
  const f = path.join(tmp, name);
  await fs.writeFile(f, content);
  return f;
}

/** Load Configuration: files, order, title, author and options, exactly as a saved config would. */
export async function loadConfiguration(win, tmp, cfg) {
  const file = await writeTemp(tmp, 'compiler-config.json', JSON.stringify(cfg, null, 2));
  await win.locator('input[type=file][accept="application/json,.json"]').setInputFiles(file);
  await sleep(1500);
}

export async function chooseFormat(win, fmt) {
  const spec = FORMATS.find((f) => f.id === fmt);
  await win.getByRole('button', { name: spec.button }).first().click();
  await sleep(800);
}

export function templateSelect(win) {
  return win.locator('select', { has: win.locator('option', { hasText: 'No template (use default)' }) });
}

/** Re-select the template (via "no template" first) so the page re-reads its schema and defaults. */
export async function chooseTemplate(win, value) {
  const sel = templateSelect(win);
  await sel.waitFor({ timeout: 15_000 });
  await sel.selectOption('');
  await sleep(400);
  if (value) {
    await sel.selectOption(value);
    await sleep(1500);
  }
}

function docVarField(win, label) {
  return win.locator(`xpath=//div[contains(@class,'space-y-1')][div/span[normalize-space(.)=${JSON.stringify(label)}]]`).first();
}

export async function fillDocumentVariables(win, tmp, schema, vars) {
  for (const [key, value] of Object.entries(vars || {})) {
    const def = (schema.variables || {})[key] || {};
    const field = docVarField(win, def.label || key);
    if (def.type === 'table') {
      await field.getByRole('button', { name: /Edit Table/ }).click();
      const csv = toCsv(value.columns, value.rows.map((r) => value.columns.map((c) => r[c])));
      const dialog = win.getByRole('dialog').last();
      const input = (await dialog.count()) ? dialog.locator('input[type=file]') : win.locator('input[type=file][accept=".csv,text/csv"]').last();
      await input.setInputFiles(await writeTemp(tmp, `${key}.csv`, csv));
      await sleep(500);
      await win.getByRole('button', { name: 'Close', exact: true }).last().click();
    } else if (def.type === 'array' && def.item?.type === 'object') {
      const fields = Object.keys(def.item.fields || {});
      const csv = toCsv(fields, value.map((r) => fields.map((f) => r[f])));
      await field.locator('input[type=file]').setInputFiles(await writeTemp(tmp, `${key}.csv`, csv));
    } else if (def.type === 'boolean') {
      await field.locator('input[type=checkbox]').setChecked(Boolean(value));
    } else if (Array.isArray(def.enum)) {
      await field.locator('select').selectOption(String(value));
    } else {
      await field.locator('input').first().fill(String(value));
    }
    await sleep(200);
  }
}

export async function fillNodeVariables(win, schema, nodeVars) {
  const keys = Object.keys(schema.nodeVariables || {});
  for (const [nodePath, vars] of Object.entries(nodeVars || {})) {
    const row = win.locator('tr', { has: win.locator('td', { hasText: nodePath }) }).first();
    for (const [k, v] of Object.entries(vars)) {
      const idx = keys.indexOf(k);
      if (idx < 0) continue;
      await row.locator('input').nth(idx).fill(String(v));
    }
  }
}

/** Click Compile and Download; returns { status, body } of the compile request. */
export async function compile(win) {
  const [resp] = await Promise.all([
    win.waitForResponse((r) => r.url().includes('/compile') && r.request().method() === 'POST', { timeout: 180_000 }),
    win.getByRole('button', { name: /Compile and Download/ }).click(),
  ]);
  const body = await resp.body();
  await win.getByRole('button', { name: /Compile and Download/ }).waitFor({ timeout: 30_000 }).catch(() => {});
  await sleep(1200);
  return { status: resp.status(), body };
}

// ---------------------------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------------------------

export async function runCase(win, tmp, projectPath, c, fmt) {
  const nodes = c.nodes || CASES.defaultNodes;
  const options = { ...OPTION_DEFAULTS, ...(c.options || {}) };
  delete options.title;
  delete options.author;
  const settingsFile = path.join(projectPath, 'verbweaver-settings.yaml');
  if (c.projectDefault) {
    await fs.writeFile(settingsFile, yaml.dump({ compiler: { defaultTemplates: { [fmt]: `${fmt}/${c.projectDefault}` } } }));
  } else if (existsSync(settingsFile)) {
    await fs.rm(settingsFile);
  }

  await chooseFormat(win, fmt);
  await chooseTemplate(win, '');
  await loadConfiguration(win, tmp, {
    title: c.options?.title || '',
    author: c.options?.author || '',
    selectedNodes: nodes,
    orderedNodes: nodes,
    selectedFormat: fmt,
    options: c.uiOptions ? OPTION_DEFAULTS : options,
  });
  if (c.uiOptions) {
    // Exercise the option checkboxes themselves
    const labels = { includeMetadata: 'Include metadata', includeToc: 'Include table of contents', embedUploadedFiles: 'Embed uploaded files (if supported by format)' };
    for (const [k, label] of Object.entries(labels)) {
      if (k in (c.options || {})) await win.getByLabel(label).setChecked(Boolean(c.options[k]));
    }
  }
  const schema = await templateSchema(projectPath, fmt, c.template);
  await chooseTemplate(win, c.template ? `${fmt}/${c.template}` : '');
  await fillDocumentVariables(win, tmp, schema, c.vars);
  await fillNodeVariables(win, schema, c.nodeVars);
  return compile(win);
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  const outDir = path.resolve(typeof args.out === 'string' ? args.out : path.join(os.tmpdir(), 'vw-compiler-stress'));
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  buildDesktop({ log });
  const frontend = await ensureFrontend({ preview: Boolean(args.preview), log });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vw-compiler-stress-'));
  const { app, win } = await launchApp({ profileDir: path.join(tmp, 'profile'), headed: Boolean(args.headed) });
  // Electron would show a Save dialog for each download; save them to the temp folder instead
  await app.evaluate(({ session }, [dir, sep]) => {
    session.defaultSession.on('will-download', (_e, item) => item.setSavePath(dir + sep + item.getFilename()));
  }, [path.join(tmp, 'downloads'), path.sep]);

  try {
    const projectPath = path.join(tmp, 'Compiler Stress');
    log('Creating the stress project...');
    await createProject(win, { name: 'Compiler Stress', description: 'Template stress test' }, projectPath);
    await populateProject(projectPath);
    await openProject(win, projectPath);
    await openCompiler(win);

    for (const c of CASES.cases) {
      if (ONLY && !ONLY.has(c.id)) continue;
      for (const { id: fmt } of FORMATS) {
        if (ONLY_FORMATS && !ONLY_FORMATS.has(fmt)) continue;
        log(`${c.id} / ${fmt}`);
        try {
          const { status, body } = await runCase(win, tmp, projectPath, c, fmt);
          await fs.writeFile(path.join(outDir, `${c.id}__${fmt}.status`), String(status));
          await fs.writeFile(path.join(outDir, `${c.id}__${fmt}.out`), body);
        } catch (err) {
          log(`  failed to run: ${err.message.split('\n')[0]}`);
          await fs.writeFile(path.join(outDir, `${c.id}__${fmt}.status`), 'ui-error');
          await fs.writeFile(path.join(outDir, `${c.id}__${fmt}.out`), String(err.stack || err));
          await win.screenshot({ path: path.join(outDir, `${c.id}__${fmt}.png`) }).catch(() => {});
          await win.keyboard.press('Escape').catch(() => {});
        }
      }
    }
  } finally {
    await closeApp(app, { log });
    if (frontend) stopProcessTree(frontend.pid);
    if (!args.keep) await fs.rm(tmp, { recursive: true, force: true });
    else log(`Kept temp folder: ${tmp}`);
  }

  log(`Outputs in ${outDir}; checking them...`);
  const py = [path.join(REPO, '.venv', 'bin', 'python'), path.join(REPO, 'backend', '.venv', 'bin', 'python'),
    path.join(REPO, '.venv', 'Scripts', 'python.exe'), path.join(REPO, 'backend', '.venv', 'Scripts', 'python.exe')]
    .find((p) => existsSync(p)) || 'python3';
  execFileSync(py, ['tests/compiler_harness.py', '--check-dir', outDir], {
    cwd: path.join(REPO, 'backend'),
    stdio: 'inherit',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
