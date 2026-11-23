# Desktop app tests (Playwright)

End-to-end tests that drive the Verbweaver desktop app with [Playwright](https://playwright.dev/docs/api/class-electron). They cover the Compiler page (`compiler.spec.mjs`): every export format, the variable forms (text, checkboxes, menus, Import CSV, tables, per-node values), the options, default templates, error messages, and Save/Load Configuration. `graph.spec.mjs` covers the Graph view: saved folder positions, sub-view switching, shortcuts, right-click menus, delete confirmations, and the Group layout. `tasks.spec.mjs` covers the Tasks view: Create Task fields, editing older tasks, dragging tasks onto Unscheduled (To-Do and Calendar), and task settings that must not reset each other. `settings.spec.mjs` covers Settings: theme Export/Import/Save as Custom and colour swatches, and the Data Locations defaults and restart prompt.

```bash
npm run test:e2e                          # from the repo root
npm run test:e2e -- -g "Save Configuration"   # one test
```

Prerequisites:
- `npm ci` and `npm run build:shared`;
- a backend venv in `.venv` or `backend/.venv`;
- `pandoc`, and for PDF a PDF engine and `pdftotext`, on your PATH.

The tests build the desktop main process, start the frontend dev server unless one is already on port 3000, and launch the app with a throwaway profile and project. The Compiler tests build theirs from `tests/compiler/fixture`, and the Graph tests make a fresh one for each test. On Linux the window is hidden.

Environment variables:
- `E2E_PREVIEW=1` serves the built frontend instead of the dev server. Run `npm run build:frontend` first.
- `E2E_SKIP_BUILD=1` skips building the desktop main process.

## In CI

`.github/workflows/e2e.yml` runs these tests on pushes to `release-testing`, and on demand from the Actions tab (**E2E (desktop app)** → **Run workflow**). The HTML report and traces are uploaded as an artifact. The faster template tests in `backend/tests` run on every pull request.
