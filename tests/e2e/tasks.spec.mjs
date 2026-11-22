/**
 * Tasks view, end to end (#102, #103, #104, #106): Create Task fields, saving older tasks,
 * dragging tasks onto Unscheduled, and task settings that must not reset each other.
 * One app and project for the file; each test uses its own task pages.
 */
import { test as base, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  buildDesktop, ensureFrontend, launchApp, closeApp, createProject, openProject, stopProcessTree, sleep,
} from '../../scripts/lib/electron-app.mjs';

const test = base.extend({
  tasks: [async ({}, use) => {
    if (!process.env.E2E_SKIP_BUILD) buildDesktop();
    const frontend = await ensureFrontend({ preview: Boolean(process.env.E2E_PREVIEW) });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vw-e2e-tasks-'));
    const { app, win } = await launchApp({ profileDir: path.join(tmp, 'profile') });
    const projectPath = path.join(tmp, 'Tasks Project');
    await createProject(win, { name: 'Tasks Project', description: 'Tasks tests' }, projectPath);
    await openProject(win, projectPath);
    try {
      await use({ app, win, tmp, projectPath });
    } finally {
      await closeApp(app);
      if (frontend) stopProcessTree(frontend.pid);
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }, { scope: 'worker', timeout: 5 * 60_000 }],
});

// Dates as the app sees them (local time, YYYY-MM-DD)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date());
const YESTERDAY = ymd(new Date(Date.now() - 24 * 60 * 60 * 1000));

async function readFrontMatter(file) {
  const text = await fs.readFile(file, 'utf8');
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  // JSON schema, as the app uses: dates stay YYYY-MM-DD strings
  return m ? yaml.load(m[1], { schema: yaml.JSON_SCHEMA }) : {};
}

/** Write task pages, then re-open the project so the app loads them. */
async function addTasks(win, projectPath, tasks) {
  for (const t of tasks) {
    const fm = { id: t.id, title: t.title, type: 'node', links: [], task: { status: 'todo', ...t.task } };
    await fs.writeFile(path.join(projectPath, 'nodes', t.file), `---\n${yaml.dump(fm)}---\n\n# ${t.title}\n`);
  }
  await openProject(win, projectPath);
}

const taskOf = async (projectPath, file) => (await readFrontMatter(path.join(projectPath, 'nodes', file))).task || {};

async function goTo(win, hash) {
  await win.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(1000);
}

async function openTasks(win, subView) {
  await goTo(win, '#/tasks');
  await win.locator(`button[title="${subView}"]`).click();
  await sleep(500);
}

async function showUnscheduled(win) {
  const unscheduled = win.locator('#vw-unscheduled');
  if (!(await unscheduled.isVisible())) await win.getByRole('button', { name: 'Show Unscheduled' }).first().click();
  await expect(unscheduled).toBeVisible();
  return unscheduled;
}

const modal = (win) => win.locator('.fixed.inset-0').last();

// ---------------------------------------------------------------------------------------------

test.describe('Create Task', () => {
  test('saves Urgent priority and text Level of Effort as entered (#102, #103)', async ({ tasks }) => {
    const { win, projectPath } = tasks;
    await openTasks(win, 'Board');
    await win.getByRole('button', { name: 'New Task' }).first().click();
    const dialog = modal(win);
    await dialog.getByPlaceholder('Enter task title').fill('Urgent Task');
    // The default template (templates/nodes/Basic.md) is picked once the list loads
    await expect(dialog.locator('select').first()).not.toHaveValue('');
    const priority = dialog.locator('select').filter({ has: win.locator('option[value="urgent"]') });
    await expect(priority.locator('option')).toHaveText(['Low', 'Medium', 'High', 'Urgent']);
    await priority.selectOption('urgent');
    await dialog.getByPlaceholder('e.g., Small, Medium, Large or 3 points').fill('Small');
    await dialog.getByRole('button', { name: 'Create Task' }).click();
    await expect(dialog.getByPlaceholder('Enter task title')).toBeHidden();

    // Find the new page on disk by its title
    let task = null;
    await expect.poll(async () => {
      for (const f of await fs.readdir(path.join(projectPath, 'nodes'))) {
        if (!f.endsWith('.md')) continue;
        const fm = await readFrontMatter(path.join(projectPath, 'nodes', f));
        if (fm.title === 'Urgent Task') { task = fm.task; return true; }
      }
      return false;
    }, { timeout: 15_000 }).toBe(true);
    expect(task.priority).toBe('urgent');
    expect(task.levelOfEffort).toBe('Small');
    // Urgent cards are red
    await expect(win.locator('.border-red-500', { hasText: 'Urgent Task' })).toBeVisible();
  });
});

test.describe('Task details', () => {
  test('a task saved with a numeric Level of Effort can be edited and saved', async ({ tasks }) => {
    const { win, projectPath } = tasks;
    await addTasks(win, projectPath, [
      { file: 'numeric-effort.md', id: 'numeric-effort', title: 'Numeric Effort', task: { levelOfEffort: 3 } },
    ]);
    await openTasks(win, 'Board');
    await win.getByText('Numeric Effort', { exact: true }).first().click();
    const dialog = modal(win);
    await expect(dialog.getByText('Level of Effort')).toBeVisible();
    await dialog.locator('.border-b button').first().click(); // pencil: start editing
    await expect(dialog.locator('input[maxlength="100"]')).toHaveValue('3');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    // Saved as text; before the fix Save threw and nothing was written
    await expect.poll(async () => (await taskOf(projectPath, 'numeric-effort.md')).levelOfEffort, { timeout: 10_000 })
      .toBe('3');
    await dialog.locator('.border-b button').last().click(); // close
    await expect(dialog.getByRole('button', { name: 'Save Changes' })).toBeHidden();
  });
});

test.describe('Unscheduled', () => {
  test('To-Do: dragging a task onto Unscheduled removes its due date; overdue tasks can be rescheduled (#104)', async ({ tasks }) => {
    const { win, projectPath } = tasks;
    await addTasks(win, projectPath, [
      { file: 'due-today.md', id: 'due-today', title: 'Due Today', task: { dueDate: TODAY } },
      { file: 'overdue.md', id: 'overdue', title: 'Overdue Task', task: { dueDate: YESTERDAY } },
    ]);
    await openTasks(win, 'To-Do');
    const unscheduled = await showUnscheduled(win);
    const todayPanel = win.locator('div.border.rounded', { has: win.locator('h3', { hasText: "Today's Tasks" }) });
    const overduePanel = win.locator('div.border.rounded', { has: win.locator('h3', { hasText: 'Overdue Tasks' }) });
    await expect(unscheduled).not.toContainText('Due Today');

    // Today -> Unscheduled
    await todayPanel.getByText('Due Today', { exact: true }).dragTo(unscheduled);
    await expect.poll(async () => (await taskOf(projectPath, 'due-today.md')).dueDate, { timeout: 10_000 })
      .toBeUndefined();
    await expect(unscheduled).toContainText('Due Today');
    await expect(todayPanel).not.toContainText('Due Today');

    // Overdue -> Today
    await overduePanel.getByText('Overdue Task', { exact: true }).dragTo(todayPanel.locator('h3'));
    await expect.poll(async () => (await taskOf(projectPath, 'overdue.md')).dueDate, { timeout: 10_000 })
      .toBe(TODAY);
    await expect(todayPanel).toContainText('Overdue Task');

    // Unscheduled -> Today still works
    await unscheduled.getByText('Due Today', { exact: true }).dragTo(todayPanel.locator('h3'));
    await expect.poll(async () => (await taskOf(projectPath, 'due-today.md')).dueDate, { timeout: 10_000 })
      .toBe(TODAY);
  });

  test('Calendar: dragging an event onto Unscheduled removes its due date', async ({ tasks }) => {
    const { win, projectPath } = tasks;
    await addTasks(win, projectPath, [
      { file: 'calendar-task.md', id: 'calendar-task', title: 'Calendar Task', task: { dueDate: TODAY } },
    ]);
    await openTasks(win, 'Calendar');
    const unscheduled = await showUnscheduled(win);
    const event = win.locator('.fc-event', { hasText: 'Calendar Task' }).first();
    await expect(event).toBeVisible();
    const from = await event.boundingBox();
    const to = await unscheduled.boundingBox();
    const sx = from.x + from.width / 2;
    const sy = from.y + from.height / 2;
    const tx = to.x + to.width / 2;
    const ty = to.y + 80;
    await win.mouse.move(sx, sy);
    await win.mouse.down();
    for (let i = 1; i <= 20; i++) await win.mouse.move(sx + ((tx - sx) * i) / 20, sy + ((ty - sy) * i) / 20);
    await sleep(200);
    await win.mouse.up();
    await expect.poll(async () => (await taskOf(projectPath, 'calendar-task.md')).dueDate, { timeout: 10_000 })
      .toBeUndefined();
    await expect(unscheduled).toContainText('Calendar Task');
    await expect(win.locator('.fc-event', { hasText: 'Calendar Task' })).toHaveCount(0);
  });
});

test.describe('Task settings', () => {
  test('saving one setting never resets another; one commit per save (#106)', async ({ tasks }) => {
    const { win, projectPath } = tasks;
    const settingsFile = path.join(projectPath, 'verbweaver-settings.yaml');
    const tasksSettings = async () => {
      try { return (yaml.load(await fs.readFile(settingsFile, 'utf8')) || {}).tasks || {}; } catch { return {}; }
    };
    const settingsCommits = () => execFileSync('git', ['log', '--oneline', '--grep=Update tasks settings'], {
      cwd: projectPath, encoding: 'utf8',
    }).split('\n').filter(Boolean).length;
    const commitsBefore = settingsCommits();

    await goTo(win, '#/settings/project');
    const autoCommit = win.locator('#vw-auto-commit');
    await expect(autoCommit).toBeVisible({ timeout: 15_000 });
    await expect(autoCommit).not.toBeChecked();

    // 1. Turn on auto-commit
    await autoCommit.check();
    await expect.poll(async () => (await tasksSettings()).autoCommitOnTaskUpdate, { timeout: 10_000 }).toBe(true);

    // 2. Change the default template: auto-commit stays on (#106)
    const templateSelect = win.locator('select').filter({ has: win.locator('option', { hasText: '(none)' }) })
      .filter({ hasNot: win.locator('option[value="todo"]') }).first();
    const templateValues = await templateSelect.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    expect(templateValues.length).toBeGreaterThan(0);
    await templateSelect.selectOption(templateValues[0]);
    await expect.poll(async () => (await tasksSettings()).defaultTemplatePath, { timeout: 10_000 }).toBe(templateValues[0]);
    expect((await tasksSettings()).autoCommitOnTaskUpdate).toBe(true);

    // 3. From the Tasks view, change the Completed Column: the other settings are kept
    await openTasks(win, 'To-Do');
    await win.getByRole('button', { name: 'Manage Statuses' }).click();
    const completed = win.locator('div', { has: win.locator('h3', { hasText: 'Completed Column' }) }).locator('select').last();
    const columnIds = await completed.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    const current = (await tasksSettings()).completedColumnId;
    const next = columnIds.find((id) => id !== current);
    await completed.selectOption(next);
    await expect.poll(async () => (await tasksSettings()).completedColumnId, { timeout: 10_000 }).toBe(next);
    const afterColumns = await tasksSettings();
    expect(afterColumns.autoCommitOnTaskUpdate).toBe(true);
    expect(afterColumns.defaultTemplatePath).toBe(templateValues[0]);
    await win.getByRole('button', { name: 'Close', exact: true }).click();

    // 4. Clear the default template: it is removed, auto-commit stays on
    await goTo(win, '#/settings/project');
    await expect(autoCommit).toBeChecked({ timeout: 15_000 });
    await expect(templateSelect).toHaveValue(templateValues[0]);
    await templateSelect.selectOption('');
    await expect.poll(async () => 'defaultTemplatePath' in (await tasksSettings()), { timeout: 10_000 }).toBe(false);
    const final = await tasksSettings();
    expect(final.autoCommitOnTaskUpdate).toBe(true);
    expect(final.completedColumnId).toBe(next);

    // One git commit per save (4 saves), not two
    await expect.poll(settingsCommits, { timeout: 10_000 }).toBe(commitsBefore + 4);
  });
});
