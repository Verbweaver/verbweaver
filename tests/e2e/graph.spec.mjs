/**
 * Graph view, end to end: saved folder positions in .verbweaver/outline.yaml survive opening the
 * Graph (#111) and re-opening it after the file changed (#112). Each test gets its own app and project.
 */
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  buildDesktop, ensureFrontend, launchApp, closeApp, createProject, openProject, stopProcessTree, sleep,
} from '../../scripts/lib/electron-app.mjs';

const test = base.extend({
  graph: async ({}, use) => {
    if (!process.env.E2E_SKIP_BUILD) buildDesktop();
    const frontend = await ensureFrontend({ preview: Boolean(process.env.E2E_PREVIEW) });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vw-e2e-graph-'));
    const { app, win } = await launchApp({ profileDir: path.join(tmp, 'profile') });
    const projectPath = path.join(tmp, 'Graph Project');
    await createProject(win, { name: 'Graph Project', description: 'Graph tests' }, projectPath);
    for (const folder of ['Alpha', 'Beta']) {
      await fs.mkdir(path.join(projectPath, 'nodes', folder), { recursive: true });
      await fs.writeFile(path.join(projectPath, 'nodes', folder, '.gitkeep'), '');
    }
    try {
      await use({ app, win, tmp, projectPath, outlineFile: path.join(projectPath, '.verbweaver', 'outline.yaml') });
    } finally {
      await closeApp(app);
      if (frontend) stopProcessTree(frontend.pid);
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  },
});

const SAVED = { 'nodes/Alpha': { x: 900, y: 50 }, 'nodes/Beta': { x: 900, y: 300 } };

async function readPositions(file) {
  try {
    const parsed = yaml.load(await fs.readFile(file, 'utf8')) || {};
    return parsed.graph_positions ?? null;
  } catch {
    return null;
  }
}

async function writePositions(file, positions) {
  let parsed = {};
  try { parsed = yaml.load(await fs.readFile(file, 'utf8')) || {}; } catch {}
  parsed.graph_positions = { ...(parsed.graph_positions || {}), ...positions };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, yaml.dump(parsed));
}

/** A Mind Map node's rendered position, from React Flow's transform. */
async function nodePosition(win, id) {
  const node = win.locator(`.react-flow__node[data-id="${id}"]`);
  await node.waitFor({ timeout: 30_000 });
  const transform = await node.evaluate((el) => el.style.transform);
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

async function openNav(win, name) {
  await win.getByRole('link', { name, exact: true }).first().click();
}

/** Whether the renderer answers within `ms`. */
async function responsive(win, ms = 3000) {
  return Promise.race([win.evaluate(() => true).catch(() => false), sleep(ms).then(() => false)]);
}

test.describe('Graph folder positions', () => {
  test('saved positions are used, not overwritten, when the Graph first opens (#111)', async ({ graph }) => {
    const { win, projectPath, outlineFile } = graph;
    await writePositions(outlineFile, SAVED);
    await openProject(win, projectPath);
    await openNav(win, 'Graph');
    expect(await nodePosition(win, 'nodes/Alpha')).toEqual(SAVED['nodes/Alpha']);
    expect(await nodePosition(win, 'nodes/Beta')).toEqual(SAVED['nodes/Beta']);
    await sleep(3000);
    const after = await readPositions(outlineFile);
    expect(after['nodes/Alpha']).toEqual(SAVED['nodes/Alpha']);
    expect(after['nodes/Beta']).toEqual(SAVED['nodes/Beta']);
  });

  test('re-opening the Graph after outline.yaml changed keeps the app responsive (#112)', async ({ graph }) => {
    const { win, projectPath, outlineFile } = graph;
    await openProject(win, projectPath);
    await openNav(win, 'Graph');
    await nodePosition(win, 'nodes/Alpha');
    await sleep(2000);
    await writePositions(outlineFile, SAVED);
    await openNav(win, 'Version Control');
    await sleep(1500);
    await openNav(win, 'Graph');

    const states = new Set();
    let allResponsive = true;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      if (!(await responsive(win))) allResponsive = false;
      const p = await readPositions(outlineFile);
      states.add(JSON.stringify({ a: p?.['nodes/Alpha'], b: p?.['nodes/Beta'] }));
    }
    expect(allResponsive).toBe(true);
    expect([...states]).toEqual([JSON.stringify({ a: SAVED['nodes/Alpha'], b: SAVED['nodes/Beta'] })]);
    expect(await nodePosition(win, 'nodes/Alpha')).toEqual(SAVED['nodes/Alpha']);
  });

  test('dragging a folder in Rigid mode saves its new position', async ({ graph }) => {
    const { win, projectPath, outlineFile } = graph;
    // Close together, so neither ends up under the options panel on the right
    const start = { 'nodes/Alpha': { x: 100, y: 200 }, 'nodes/Beta': { x: 400, y: 200 } };
    await writePositions(outlineFile, start);
    await openProject(win, projectPath);
    await openNav(win, 'Graph');
    const before = await nodePosition(win, 'nodes/Alpha');
    expect(before).toEqual(start['nodes/Alpha']);
    const box = await win.locator('.react-flow__node[data-id="nodes/Alpha"]').boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await win.mouse.move(sx, sy);
    await win.mouse.down();
    for (let i = 1; i <= 10; i++) await win.mouse.move(sx - 15 * i, sy + 10 * i);
    await win.mouse.up();
    await expect.poll(async () => (await readPositions(outlineFile))?.['nodes/Alpha'], { timeout: 10_000 })
      .not.toEqual(before);
    const saved = (await readPositions(outlineFile))['nodes/Alpha'];
    expect(saved).toEqual(await nodePosition(win, 'nodes/Alpha'));
    // The other folder is left alone
    expect((await readPositions(outlineFile))['nodes/Beta']).toEqual(start['nodes/Beta']);
  });
});

// ---------------------------------------------------------------------------------------------
// Graph view behaviour: sub-view switching, shortcuts, menus, deletes and the Group layout
// (#97, #98, #99, #100, #101, #114)

const PAGES = [
  // One and Two sit apart from the folder lines, so the link between them can be clicked
  { file: 'one.md', id: 'page-one', title: 'One', links: ['page-two'], position: { x: 700, y: -200 } },
  { file: 'two.md', id: 'page-two', title: 'Two', links: ['page-one'], position: { x: 700, y: 300 } },
  { file: 'three.md', id: 'page-three', title: 'Three', links: [] },
  { file: 'four.md', id: 'page-four', title: 'Four', links: [] },
  { file: 'five.md', id: 'page-five', title: 'Five', links: [] },
];

/** Pages (One and Two link to each other) and an extra node template, "Scene". */
async function addPages(projectPath) {
  for (const p of PAGES) {
    const fm = { id: p.id, title: p.title, type: 'node', links: p.links, ...(p.position ? { position: p.position } : {}) };
    await fs.writeFile(path.join(projectPath, 'nodes', p.file), `---\n${yaml.dump(fm)}---\n\n# ${p.title}\n`);
  }
  const tplDir = path.join(projectPath, 'templates', 'nodes');
  await fs.mkdir(tplDir, { recursive: true });
  await fs.writeFile(path.join(tplDir, 'Scene.md'), '---\ntitle: Scene\ntype: node\ndescription: A scene.\n---\n\n# $title$\n');
}

async function readFrontMatter(file) {
  const text = await fs.readFile(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  return m ? yaml.load(m[1]) : {};
}

const subViewButton = (win, name) => win.getByRole('button', { name, exact: true }).first();
const contextMenu = (win) => win.locator('.vw-node-context-menu');
const confirmDialog = (win, title) =>
  win.locator('.fixed.inset-0').filter({ has: win.locator('h2', { hasText: title }) });

async function openGraphWithPages(graph) {
  const { win, projectPath } = graph;
  await addPages(projectPath);
  await openProject(win, projectPath);
  await openNav(win, 'Graph');
  await nodePosition(win, 'nodes/one.md');
}

/** Click a page card that no panel covers; returns its id. */
async function clickUncoveredPage(win) {
  await sleep(1500);
  const hit = await win.evaluate(() => {
    for (const el of document.querySelectorAll('.react-flow__node')) {
      const id = el.getAttribute('data-id') || '';
      if (!id.endsWith('.md')) continue;
      const r = el.getBoundingClientRect();
      const pt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (document.elementFromPoint(pt.x, pt.y)?.closest('.react-flow__node') === el) return { id, ...pt };
    }
    return null;
  });
  if (!hit) throw new Error('Every page card is covered');
  // Click until the card shows as selected (the board can still be settling right after it opens)
  const node = win.locator(`.react-flow__node[data-id="${hit.id}"]`);
  await expect(async () => {
    await win.mouse.click(hit.x, hit.y);
    await expect(node).toHaveClass(/\bselected\b/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return hit.id;
}

/** Right-click an element with the real mouse. For edges (thin SVG paths), aim at the middle of the line. */
async function rightClick(locator) {
  const point = await locator.evaluate((el) => {
    const path = el.querySelector('path.react-flow__edge-path');
    if (path) {
      // Lines can overlap; use the first point along this one where it is on top
      const m = path.getScreenCTM();
      for (let i = 0; i <= 20; i++) {
        const f = 0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.045;
        const p = path.getPointAtLength(path.getTotalLength() * f);
        const pt = { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
        if (document.elementFromPoint(pt.x, pt.y)?.closest('.react-flow__edge') === el) return pt;
      }
      return null;
    }
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!point) throw new Error('No visible point to right-click on that line');
  await locator.page().mouse.click(point.x, point.y, { button: 'right' });
}

test.describe('Graph view', () => {
  test('Progression offers Group, and Delete only acts in the Mind Map (#97, #100)', async ({ graph }) => {
    const { win } = graph;
    await openGraphWithPages(graph);

    // Delete in the Mind Map asks to confirm
    await clickUncoveredPage(win);
    await win.keyboard.press('Delete');
    await expect(confirmDialog(win, 'Delete node')).toBeVisible();
    await confirmDialog(win, 'Delete node').getByRole('button', { name: 'Cancel' }).click();

    // With a Mind Map selection, Delete in the Outline does nothing
    await clickUncoveredPage(win);
    await subViewButton(win, 'Outline').click();
    await win.getByText('Five', { exact: true }).waitFor();
    await win.keyboard.press('Delete');
    await sleep(500);
    await expect(win.locator('h2', { hasText: /Delete/ })).toHaveCount(0);

    // Progression's switcher has Group, and it works
    await subViewButton(win, 'Progression').click();
    const groupButton = win.getByRole('button', { name: 'Group', exact: true });
    await expect(groupButton).toHaveCount(1);
    await groupButton.click();
    await expect(win.getByRole('button', { name: /^Add/ }).first()).toBeVisible();
  });

  test('Outline rows can be dragged while Rigid mode is on (#98)', async ({ graph }) => {
    const { win, outlineFile } = graph;
    await openGraphWithPages(graph);
    await subViewButton(win, 'Outline').click();
    await expect(win.getByText('Rigid mode')).toHaveCount(0);
    const two = win.getByText('Two', { exact: true });
    const five = win.getByText('Five', { exact: true });
    await five.waitFor();
    const from = await two.boundingBox();
    const to = await five.boundingBox();
    await win.mouse.move(from.x + 5, from.y + from.height / 2);
    await win.mouse.down();
    await win.mouse.move(to.x + 5, to.y + 2, { steps: 5 });
    await win.mouse.move(to.x + 5, to.y + 1, { steps: 2 });
    await win.mouse.up();
    await expect.poll(async () => {
      try {
        const order = (yaml.load(await fs.readFile(outlineFile, 'utf8')) || {}).outline?.nodes || [];
        return order.indexOf('nodes/two.md') !== -1 && order.indexOf('nodes/two.md') < order.indexOf('nodes/five.md');
      } catch { return false; }
    }, { timeout: 10_000 }).toBe(true);
  });

  test('link menus show link actions only; folder lines cannot be unlinked (#101)', async ({ graph }) => {
    const { win, projectPath } = graph;
    await openGraphWithPages(graph);

    // Folder line: Unlink is disabled with an explanation, and no canvas actions
    await rightClick(win.getByRole('group', { name: 'Edge from nodes to nodes/Alpha' }));
    await expect(contextMenu(win)).toBeVisible();
    await expect(contextMenu(win)).toContainText('move the page to another folder');
    await expect(contextMenu(win)).not.toContainText('Upload File');
    await expect(contextMenu(win).getByRole('button', { name: 'Unlink' })).toHaveCount(0);
    await win.keyboard.press('Escape');
    await win.mouse.click(5, 5);

    // Soft link: only Unlink, which removes the link and closes the menu
    await rightClick(win.getByRole('group', { name: 'Edge from nodes/one.md to nodes/two.md' }));
    await expect(contextMenu(win)).not.toContainText('Upload File');
    await expect(contextMenu(win)).not.toContainText('From Template');
    await contextMenu(win).getByRole('button', { name: 'Unlink' }).click();
    await expect(contextMenu(win)).toHaveCount(0);
    await expect.poll(async () => (await readFrontMatter(path.join(projectPath, 'nodes', 'one.md'))).links || [], { timeout: 10_000 })
      .not.toContain('page-two');
  });

  test('From Template preselects the picked template', async ({ graph }) => {
    const { win } = graph;
    await openGraphWithPages(graph);
    // Right-click a spot on the board that nothing covers
    const spot = await win.evaluate(() => {
      const pane = document.querySelector('.react-flow__pane');
      const r = pane.getBoundingClientRect();
      for (let y = r.top + 60; y < r.bottom - 60; y += 40) {
        for (let x = r.left + 60; x < r.right - 60; x += 40) {
          if (document.elementFromPoint(x, y) === pane) return { x, y };
        }
      }
      return null;
    });
    expect(spot).not.toBeNull();
    await win.mouse.click(spot.x, spot.y, { button: 'right' });
    await contextMenu(win).getByRole('button', { name: 'Scene' }).click();
    const selected = win.locator('div.bg-accent.border-primary h4');
    await expect(selected).toHaveText('Scene');
  });

  test('zoom controls, minimap and credit link follow the dark theme (#149)', async ({ graph }) => {
    const { win } = graph;
    await openGraphWithPages(graph);
    const colours = () => win.evaluate(() => {
      const css = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
      const probe = document.createElement('div');
      probe.style.color = 'hsl(var(--card))';
      document.body.appendChild(probe);
      const card = getComputedStyle(probe).color;
      probe.remove();
      return {
        card,
        buttonBg: css('.react-flow__controls-button', 'backgroundColor'),
        iconFill: css('.react-flow__controls-button svg', 'fill'),
        minimapBg: css('.react-flow__minimap', 'backgroundColor'),
        creditBg: css('.react-flow__attribution', 'backgroundColor'),
      };
    });
    const check = async () => {
      const c = await colours();
      expect(c.buttonBg).toBe(c.card);
      expect(c.iconFill).not.toBe(c.buttonBg);
      expect(c.minimapBg).toBe(c.card);
      expect(c.creditBg).not.toMatch(/^rgba\(255, 255, 255/);
    };
    await check(); // Mind Map
    await subViewButton(win, 'Group').click();
    await expect(win.locator('.react-flow__controls-button').first()).toBeVisible();
    const c = await colours();
    expect(c.buttonBg).toBe(c.card);
    expect(c.iconFill).not.toBe(c.buttonBg);
  });

  test('Group view: no overlapping boxes, cards fit, deletes ask first (#99, #114)', async ({ graph }) => {
    const { win, tmp, projectPath } = graph;
    await openGraphWithPages(graph);
    await subViewButton(win, 'Group').click();

    const cfg = {
      version: 1,
      groups: PAGES.map((p, i) => ({
        id: `g${i + 1}`, name: `Group ${p.title}`, enabled: true,
        filters: { tags: [], tagsLogic: 'ANY', nameKeyword: p.title, descriptionKeyword: '', startsWith: '', endsWith: '',
          startsEndsCaseSensitive: false, hasAttachments: false, linkedFromNodeTags: [] },
      })),
      options: { nestGroups: false, showNodeCards: false, maxCardsPerGroup: 40, showCapIndicator: true },
      layout: { boxes: {} },
    };
    const cfgFile = path.join(tmp, 'groups.json');
    await fs.writeFile(cfgFile, JSON.stringify(cfg));
    await win.locator('input[type=file][accept="application/json"]').setInputFiles(cfgFile);
    const boxes = win.locator('.react-flow__node-groupBox');
    await expect(boxes).toHaveCount(PAGES.length);

    const expectNoOverlap = async () => {
      await sleep(800);
      const rects = await boxes.evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute('data-id'), x: r.left, y: r.top, w: r.width, h: r.height };
      }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
    };
    await expectNoOverlap();

    // With node cards: still no overlap, and every card sits inside its box
    await win.getByLabel('Show node cards').check();
    await expect(win.locator('.react-flow__node-custom')).toHaveCount(PAGES.length);
    await expectNoOverlap();
    const outside = await win.evaluate(() => {
      const bad = [];
      document.querySelectorAll('.react-flow__node-custom').forEach((card) => {
        const boxId = card.getAttribute('data-id').split('::n::')[0];
        const box = [...document.querySelectorAll('.react-flow__node-groupBox')].find((b) => b.getAttribute('data-id') === boxId);
        if (!box) return;
        const c = card.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (c.right > b.right + 1 || c.bottom > b.bottom + 1) bad.push(card.getAttribute('data-id'));
      });
      return bad;
    });
    expect(outside).toEqual([]);

    // Deleting a card's page asks first; Cancel keeps the file
    await rightClick(win.locator('.react-flow__node-custom').first());
    await contextMenu(win).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirmDialog(win, 'Delete node')).toBeVisible();
    await confirmDialog(win, 'Delete node').getByRole('button', { name: 'Cancel' }).click();
    for (const p of PAGES) await fs.access(path.join(projectPath, 'nodes', p.file));

    // Deleting a group asks first; Cancel keeps it, Delete removes it
    const bins = win.locator('button[title="Delete"]');
    await expect(bins).toHaveCount(PAGES.length);
    await bins.first().click();
    await confirmDialog(win, 'Delete group').getByRole('button', { name: 'Cancel' }).click();
    await expect(bins).toHaveCount(PAGES.length);
    await bins.first().click();
    await confirmDialog(win, 'Delete group').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(bins).toHaveCount(PAGES.length - 1);
  });

  test('Group view: a group holds pages matching any of its filters (#68)', async ({ graph }) => {
    const { win, tmp } = graph;
    await openGraphWithPages(graph);
    await subViewButton(win, 'Group').click();

    const byName = (nameKeyword) => ({ tags: [], tagsLogic: 'ANY', nameKeyword, descriptionKeyword: '', startsWith: '', endsWith: '',
      startsEndsCaseSensitive: false, hasAttachments: false, linkedFromNodeTags: [] });
    const cfg = {
      version: 1,
      groups: [{ id: 'g1', name: 'One or Two', enabled: true, filters: [byName('One'), byName('Two')] }],
      options: { nestGroups: false, showNodeCards: false, maxCardsPerGroup: 40, showCapIndicator: true },
      layout: { boxes: {} },
    };
    const cfgFile = path.join(tmp, 'groups.json');
    await fs.writeFile(cfgFile, JSON.stringify(cfg));
    await win.locator('input[type=file][accept="application/json"]').setInputFiles(cfgFile);
    const box = win.locator('.react-flow__node-groupBox');
    await expect(box).toHaveCount(1);
    await expect(box).toContainText('2 nodes');

    // Add filter opens the dialog on a new, blank filter; a blank filter adds nothing
    await win.getByRole('button', { name: 'Add filter' }).click();
    const dialog = win.locator('.fixed.inset-0').filter({ has: win.locator('h3', { hasText: 'Filters' }) });
    await expect(dialog).toBeVisible();
    await expect(box).toContainText('2 nodes');
    await dialog.locator('label:has-text("Keyword in name") + input').fill('Five');
    await dialog.click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await expect(box).toContainText('3 nodes');
    await expect(win.getByText('or Filter 3: name:"Five"')).toBeVisible();

    // Removing a filter drops only the pages that matched it
    await win.getByRole('button', { name: 'Remove filter 1' }).click();
    await expect(box).toContainText('2 nodes');
    await expect(win.getByRole('button', { name: 'Remove filter 3' })).toHaveCount(0);
  });
});
