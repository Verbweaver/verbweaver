# Compiler stress test

`stress.mjs` drives the desktop app's Compiler page through every case in `tests/compiler/cases.json`, in all six export formats, and checks each document the app produces. Use it after changing the template engine, the Compiler page, or the template guide (`docs/compiler-template-system.md`).

```bash
node scripts/compiler-stress/stress.mjs                        # everything (about an hour)
node scripts/compiler-stress/stress.mjs --only=basics,loops    # some cases
node scripts/compiler-stress/stress.mjs --formats=markdown,pdf # some formats
```

Other options:
- `--out=folder` keeps the outputs somewhere other than your temp folder.
- `--headed` shows the window on Linux.
- `--keep` keeps the temp project and profile.
- `--preview` serves the built frontend (`npm run build:frontend`) instead of the dev server.

Prerequisites are the same as for `scripts/help-screenshots`: `npm ci`, `npm run build:shared`, and a backend venv in `.venv` or `backend/.venv`. Exporting needs `pandoc` on your PATH, plus a PDF engine (Tectonic, xelatex or pdflatex) and `pdftotext` for PDF. In development mode the app uses these from your PATH, not the copies bundled with installers.

## How it works

For each case and format, the script works through the Compiler page:

1. It picks the format.
2. It loads the files, order, title and options with **Load Configuration**, or ticks the option checkboxes for cases marked `uiOptions`.
3. It chooses the template.
4. It fills the template's variables: text boxes, checkboxes and menus. Lists and tables use **Import CSV**, and per-node values go into the **Per-Node Variables** grid.
5. It clicks **Compile and Download** and saves the file.

`backend/tests/compiler_harness.py --check-dir` then checks every output and prints a case by format matrix.

## The cases

`tests/compiler/cases.json` lists each case: its template, pages, options and variables, and the text the output must or must not contain. `tests/compiler/fixture/` is the sample project:
- pages with details, an attachment, and references to other pages;
- one template per feature group, copied into every format folder.

The backend tests (`backend/tests/test_compiler_templates.py`) and the Playwright tests (`tests/e2e`) use the same cases.

A check that fails because of an open bug goes under the case's `"known"` map with the issue number. The tests skip it, and a separate test fails once the bug is fixed, as a reminder to remove the entry.
