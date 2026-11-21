/**
 * Shared fixtures: one Verbweaver app per worker, with a project built from
 * tests/compiler/fixture (pages, an uploaded image, and the stress templates in every format).
 */
import { test as base, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildDesktop, ensureFrontend, launchApp, closeApp, createProject, openProject, stopProcessTree,
} from '../../scripts/lib/electron-app.mjs';
import { populateProject, openCompiler } from '../../scripts/compiler-stress/stress.mjs';

export const test = base.extend({
  stress: [async ({}, use, workerInfo) => {
    if (!process.env.E2E_SKIP_BUILD) buildDesktop();
    const frontend = await ensureFrontend({ preview: Boolean(process.env.E2E_PREVIEW) });
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `vw-e2e-${workerInfo.workerIndex}-`));
    const downloads = path.join(tmp, 'downloads');
    await fs.mkdir(downloads, { recursive: true });
    const { app, win } = await launchApp({ profileDir: path.join(tmp, 'profile') });
    await app.evaluate(({ session }, [dir, sep]) => {
      session.defaultSession.on('will-download', (_e, item) => item.setSavePath(dir + sep + item.getFilename()));
    }, [downloads, path.sep]);
    const projectPath = path.join(tmp, 'E2E Project');
    await createProject(win, { name: 'E2E Project', description: 'Playwright tests' }, projectPath);
    await populateProject(projectPath);
    await openProject(win, projectPath);
    await openCompiler(win);
    try {
      await use({ app, win, tmp, projectPath, downloads });
    } finally {
      await closeApp(app);
      if (frontend) stopProcessTree(frontend.pid);
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }, { scope: 'worker', timeout: 5 * 60_000 }],
});

export { expect };
