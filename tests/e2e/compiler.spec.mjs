/**
 * Compiler page, end to end (issue #123). Each test drives the real Compiler UI the way a person
 * would and checks the document the app produced. Template-language details are covered more
 * thoroughly (and faster) by backend/tests/test_compiler_templates.py; these tests check that the
 * page's controls reach the compiler correctly.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './fixtures.mjs';
import { runCase, compile, loadConfiguration, chooseFormat, chooseTemplate } from '../../scripts/compiler-stress/stress.mjs';
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

  test('list grids and tables filled with Import CSV', async ({ stress }) => {
    for (const id of ['loops', 'schema']) {
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
});
