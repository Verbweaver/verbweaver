# Testing

| What | Command | Runs in CI |
|---|---|---|
| Backend tests, including the Compiler template tests | `cd backend && ../.venv/bin/python -m pytest` | Every pull request (`build.yml`) |
| Frontend lint and type check | `cd frontend && npm run lint && npm run type-check` | Type check and build on every pull request |
| Desktop type check | `cd desktop && npm run typecheck` | No |
| Desktop app end-to-end tests (Playwright) | `npm run test:e2e` | Pushes to `release-testing`, or manually (`e2e.yml`) |
| Compiler stress test, every case in every format | `node scripts/compiler-stress/stress.mjs` | No (about an hour) |

## Compiler template tests

`tests/compiler/cases.json` describes each template feature: a template from `tests/compiler/fixture`, the pages, options and variables, and the text the export must or must not contain. Three things use it:

- **`backend/tests/test_compiler_templates.py`** sends each case through the real compile endpoint in all six formats, with real Pandoc, and checks the text of each file.
  - Formats skip when their tool is missing: Pandoc for most formats, plus a PDF engine and `pdftotext` for PDF.
  - CI installs Pandoc and poppler, and uses the Tectonic binary from `desktop/resources/tools`.
- **`tests/e2e/compiler.spec.mjs`** drives the Compiler page for each kind of control.
- **`scripts/compiler-stress/stress.mjs`** drives the page through every case and format, for a full check before a release or after big template changes.

To add a feature test:
1. Add a template under `tests/compiler/fixture/templates/compiler/markdown/`.
2. Add a case to `cases.json`.
3. Run `python tests/compiler_harness.py` from `backend/` to see the result for every format.

If a check fails because of a known bug, add it to the case's `"known"` map with the issue number. The suite then fails as soon as the bug is fixed, so the entry gets removed.

## End-to-end tests

See [tests/e2e/README.md](../tests/e2e/README.md). The tests launch the real desktop app with a throwaway profile, using the helpers in `scripts/lib/electron-app.mjs` (shared with the Help screenshot script).
