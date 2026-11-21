/** The checks from tests/compiler/cases.json, applied to Markdown output (see compiler_harness.py). */
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../../scripts/lib/electron-app.mjs';

export const CASES = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'compiler', 'cases.json'), 'utf8'));
export const caseById = (id) => CASES.cases.find((c) => c.id === id);

const unescapeMarkdown = (t) => t.replace(/\\([\\`*_{}[\]()#+\-.!|<>$~^'"])/g, '$1');

/** Returns a list of failed checks (empty when everything passes). `skip` lists checks to ignore. */
export function failedChecks(c, markdown, skip = []) {
  const t = unescapeMarkdown(markdown.replace(/[ \t ]+/g, ' ').replace(/ \n/g, '\n'));
  const flat = t.replace(/\s+/g, ' ');
  const failed = [];
  const groups = [c, c.mdOnly || {}];
  for (const g of groups) {
    for (const s of g.expect || []) if (!t.includes(s) && !flat.includes(s)) failed.push(`expect:${s}`);
    for (const s of g.absent || []) if (t.includes(s)) failed.push(`absent:${s}`);
    for (const p of g.regex || []) if (!new RegExp(p).test(flat)) failed.push(`regex:${p}`);
    for (const [s, n] of Object.entries(g.count || {})) {
      const got = flat.split(s).length - 1;
      if (got !== n) failed.push(`count:${s} (expected ${n}, got ${got})`);
    }
  }
  return failed.filter((f) => !skip.some((k) => f.startsWith(k)));
}
