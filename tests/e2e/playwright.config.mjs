// Playwright tests for the desktop app (issue #123). Run with `npm run test:e2e` from the repo root.
// They drive the real Electron app in development mode; see tests/e2e/README.md.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  // One app instance at a time: every test shares the worker's app and project
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]] : [['list']],
  outputDir: 'test-results',
});
