/**
 * Compiler page, end to end (issue #123). Each test drives the real Compiler UI the way a person
 * would and checks the document the app produced. Template-language details are covered more
 * thoroughly (and faster) by backend/tests/test_compiler_templates.py; these tests check that the
 * page's controls reach the compiler correctly.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect } from './fixtures.mjs';
import { runCase, compile, loadConfiguration, chooseFormat, chooseTemplate, openCompiler } from '../../scripts/compiler-stress/stress.mjs';
import { caseById, failedChecks } from './checks.mjs';

/** Checks for a case, minus the ones listed under "known" (open bugs) in cases.json. */
function expectCase(c, markdown) {
  const known = Object.keys(c.known || {});
  expect(failedChecks(c, markdown, known), `output:\n${markdown.slice(0, 2000)}`).toEqual([]);
}

async function runMarkdown(stress, id) {
  const c = caseById(id);
  const { status, body } = await runCase(stress.win, stress.tmp, stress.projectPath, c, 'markdown');
  return { c, status, text: body.toString('utf8') };
}

const SIGNATURES = {
  markdown: (b) => b.toString('utf8').includes('Shipped Simple'),
  html: (b) => /<html/i.test(b.toString('utf8')) && b.toString('utf8').includes('Shipped Simple'),
  pdf: (b) => b.subarray(0, 4).toString() === '%PDF',
  docx: (b) => b.subarray(0, 2).toString() === 'PK',
  odt: (b) => b.subarray(0, 2).toString() === 'PK',
  epub: (b) => b.subarray(0, 2).toString() === 'PK',
};

test.describe('Compiler', () => {
  for (const fmt of Object.keys(SIGNATURES)) {
    test(`exports ${fmt} with the default Simple template`, async ({ stress }) => {
      const c = caseById('shipped-simple');
      const { status, body } = await runCase(stress.win, stress.tmp, stress.projectPath, c, fmt);
      expect(status).toBe(200);
      expect(SIGNATURES[fmt](body)).toBe(true);
    });
  }

  test('text, enum, number and checkbox fields, plus the date and table of contents', async ({ stress }) => {
    const { c, status, text } = await runMarkdown(stress, 'basics');
    expect(status).toBe(200);
    expectCase(c, text);
  });

  test('list grids and tables filled with Import CSV, and nested blocks', async ({ stress }) => {
    for (const id of ['loops', 'schema', 'nesting']) {
      const { c, status, text } = await runMarkdown(stress, id);
      expect(status, id).toBe(200);
      expectCase(c, text);
    }
  });

  test('Per-Node Variables grid and values read from page details', async ({ stress }) => {
    const { c, status, text } = await runMarkdown(stress, 'nodevars');
    expect(status).toBe(200);
    // The grid holds text; "true"/"false" become real booleans (#136)
    expectCase(c, text);
  });

  test('computed variables, including true/false ones', async ({ stress }) => {
    const { c, status, text } = await runMarkdown(stress, 'compute');
    expect(status).toBe(200);
    expectCase(c, text);
  });

  test('option checkboxes change the output', async ({ stress }) => {
    const { c, status, text } = await runMarkdown(stress, 'options-off');
    expect(status).toBe(200);
    expectCase(c, text);
  });

  test('references to other pages and unresolved markers', async ({ stress }) => {
    const { c, status, text } = await runMarkdown(stress, 'multipass');
    expect(status).toBe(200);
    expectCase(c, text);
  });

  test('no template uses Simple, and a project default template is used', async ({ stress }) => {
    for (const id of ['no-template', 'project-default']) {
      const { c, status, text } = await runMarkdown(stress, id);
      expect(status, id).toBe(200);
      expectCase(c, text);
    }
  });

  test('an invalid template shows why it failed', async ({ stress }) => {
    const c = caseById('invalid-template');
    const { status, body } = await runCase(stress.win, stress.tmp, stress.projectPath, c, 'markdown');
    expect(status).toBe(400);
    expect(body.toString('utf8')).toContain(c.expectError);
    await expect(stress.win.getByText(c.expectError, { exact: false }).first()).toBeVisible();
  });

  test('Save Configuration and Load Configuration round-trip', async ({ stress }) => {
    const { win, tmp, projectPath, downloads } = stress;
    const c = caseById('schema');
    const first = await runCase(win, tmp, projectPath, c, 'markdown');
    expect(first.status).toBe(200);

    const saved = path.join(downloads, 'compiler-config.json');
    await fs.rm(saved, { force: true });
    await win.getByRole('button', { name: 'Save Configuration' }).click();
    await expect.poll(async () => (await fs.stat(saved).catch(() => null)) !== null).toBe(true);
    const config = JSON.parse(await fs.readFile(saved, 'utf8'));
    expect(config.selectedTemplate).toBe('markdown/schema.md');

    // Clear the page, then restore everything from the saved file
    await chooseFormat(win, 'html');
    await chooseTemplate(win, '');
    await loadConfiguration(win, tmp, config);
    const second = await compile(win);
    expect(second.status).toBe(200);
    expect(second.body.toString('utf8')).toBe(first.body.toString('utf8'));
  });

  // Select Files and File Order (#113, #105) and the Layout options (#143)
  test.describe('page selection, ordering and layout', () => {
    /** Project-relative paths of every file under nodes/, as Select Files lists them. */
    async function allNodeFiles(projectPath) {
      const out = [];
      const walk = async (rel) => {
        for (const e of await fs.readdir(path.join(projectPath, rel), { withFileTypes: true })) {
          const p = `${rel}/${e.name}`;
          if (e.isDirectory()) await walk(p);
          else if (e.name !== '.gitkeep') out.push(p);
        }
      };
      await walk('nodes');
      return out.sort();
    }

    const selectedCount = (win) => win.getByText(/^\d+ files selected$/);
    const fileOrder = (win) => win.locator('[data-path]').evaluateAll((rows) => rows.map((r) => r.dataset.path));
    const folderCheckbox = (win, name) =>
      win.locator('div.group', { has: win.getByRole('button', { name, exact: true }) }).locator('button[aria-checked]').first();

    /** Empty selection, every folder closed and not yet loaded, as on a fresh Compiler page. */
    async function freshTree(win, tmp) {
      await loadConfiguration(win, tmp, { selectedNodes: [], orderedNodes: [], expandedDirs: [] });
      // Load Configuration only adds open folders, so close the ones earlier tests opened
      await win.getByRole('button', { name: 'Collapse All', exact: true }).click();
      const toggle = win.getByLabel('Show Nodes Only');
      await toggle.uncheck();
      await toggle.check();
      await expect(win.getByRole('button', { name: 'nodes', exact: true })).toBeVisible();
    }

    test('Select All includes files in folders that were never opened (#113)', async ({ stress }) => {
      const { win, tmp, projectPath } = stress;
      const files = await allNodeFiles(projectPath);
      expect(files.some((f) => f.split('/').length > 2)).toBe(true); // has nested folders
      await freshTree(win, tmp);
      await expect(selectedCount(win)).toHaveText('0 files selected');
      await win.getByRole('button', { name: 'Select All', exact: true }).first().click();
      await expect(selectedCount(win)).toHaveText(`${files.length} files selected`);
      expect((await fileOrder(win)).slice().sort()).toEqual(files);
    });

    test('Expand All opens nested folders in one click (#113)', async ({ stress }) => {
      const { win, tmp } = stress;
      await freshTree(win, tmp);
      await expect(win.getByRole('button', { name: 'XSS.md', exact: true })).toHaveCount(0);
      await win.getByRole('button', { name: 'Expand All', exact: true }).click();
      await expect(win.getByRole('button', { name: 'XSS.md', exact: true })).toBeVisible();
      await expect(win.getByRole('button', { name: 'Glossary.md', exact: true })).toBeVisible();
      await win.getByRole('button', { name: 'Collapse All', exact: true }).click();
    });

    test('a restored selection ticks closed folders, and Clear All clears it (#113)', async ({ stress }) => {
      const { win, tmp, projectPath } = stress;
      const files = await allNodeFiles(projectPath);
      await freshTree(win, tmp);
      await loadConfiguration(win, tmp, { selectedNodes: files, orderedNodes: files, expandedDirs: [] });
      await expect(selectedCount(win)).toHaveText(`${files.length} files selected`);
      await win.getByRole('button', { name: 'Collapse All', exact: true }).click();
      // Leave the Compiler and come back: the tab restores the selection with every folder closed
      await win.getByRole('link', { name: 'Tasks', exact: true }).first().click();
      await expect(win.getByRole('button', { name: /Compile and Download/ })).toHaveCount(0);
      await openCompiler(win);
      await expect(selectedCount(win)).toHaveText(`${files.length} files selected`);
      await expect(folderCheckbox(win, 'nodes')).toHaveAttribute('aria-checked', 'true');
      await win.getByRole('button', { name: 'Clear All', exact: true }).click();
      await expect(selectedCount(win)).toHaveText('0 files selected');
      await expect(win.locator('[data-path]')).toHaveCount(0);
    });

    test('By Date Modified and By File Size use the real dates and sizes (#105)', async ({ stress }) => {
      const { win, tmp, projectPath } = stress;
      const files = await allNodeFiles(projectPath);
      await freshTree(win, tmp);
      await loadConfiguration(win, tmp, { selectedNodes: files, orderedNodes: files, expandedDirs: [] });
      await expect(win.locator('[data-path]')).toHaveCount(files.length);
      const alphabetical = await fileOrder(win);

      // Oldest first: make reverse-path order the modification order
      const byDate = files.slice().reverse();
      const base = Date.now() / 1000 - 100_000;
      for (const [i, f] of byDate.entries()) await fs.utimes(path.join(projectPath, f), base + i * 60, base + i * 60);
      await win.getByRole('button', { name: /^By Date Modified/ }).click();
      await expect.poll(() => fileOrder(win)).toEqual(byDate);

      // Smallest first, ties by path
      const sizes = new Map();
      for (const f of files) sizes.set(f, (await fs.stat(path.join(projectPath, f))).size);
      const bySize = files.slice().sort((a, b) => sizes.get(a) - sizes.get(b) || a.localeCompare(b));
      expect(bySize).not.toEqual(alphabetical);
      await win.getByRole('button', { name: /^By File Size/ }).click();
      await expect.poll(() => fileOrder(win)).toEqual(bySize);

      // Random keeps the same pages
      await win.getByRole('button', { name: /^Random/ }).click();
      expect((await fileOrder(win)).slice().sort()).toEqual(files);
    });

    test('Layout settings reach PDF and HTML exports (#143)', async ({ stress }) => {
      const { win, tmp } = stress;
      const nodes = ['nodes/Findings/SQL Injection.md', 'nodes/Findings/XSS.md'];
      const reset = { layoutPageSize: 'default', layoutFontSize: 'default', layoutMargins: 'default', layoutLineSpacing: 'default' };
      try {
        await chooseFormat(win, 'docx');
        await chooseTemplate(win, '');
        await expect(win.getByTestId('compiler-layout')).toHaveCount(0);

        await chooseFormat(win, 'html');
        await loadConfiguration(win, tmp, { selectedNodes: nodes, orderedNodes: nodes, selectedFormat: 'html', options: reset });
        await expect(win.getByLabel('Page size')).toHaveCount(0); // PDF only
        await win.getByLabel('Line spacing').selectOption('double');
        await win.getByLabel('Font size').selectOption('large');
        const html = await compile(win);
        expect(html.status).toBe(200);
        const text = html.body.toString('utf8');
        expect(text).toContain('line-height: 2;');
        expect(text).toContain('font-size: 19px;');

        await chooseFormat(win, 'pdf');
        await win.getByLabel('Page size').selectOption('a5');
        const pdf = await compile(win);
        expect(pdf.status).toBe(200);
        const file = path.join(tmp, 'layout.pdf');
        await fs.writeFile(file, pdf.body);
        let info = '';
        try {
          info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
        } catch {
          test.info().annotations.push({ type: 'skipped-check', description: 'pdfinfo not found; page size not checked' });
        }
        if (info) expect(info).toMatch(/Page size:\s+419\.5\d* x 595\.2\d* pts/);
      } finally {
        await loadConfiguration(win, tmp, { options: reset });
      }
    });
  });
});

