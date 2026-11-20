# Help screenshots

`capture.mjs` regenerates the screenshots used by the in-app Help guides (`docs/images/*.png`). It drives the desktop app with [Playwright](https://playwright.dev/docs/api/class-electron) and a sample project, so the shots are consistent and easy to refresh after UI changes.

## Run it

From the repo root:

```bash
npm ci                      # installs playwright-core with the other dev dependencies
npm run docs:screenshots    # = node scripts/help-screenshots/capture.mjs
```

Prerequisites, the same as for desktop development (see `CLAUDE.md`):

- A backend Python environment in `<repo>/.venv` or `backend/.venv`. The app starts the backend itself.
- `npm run build:shared` has been run at least once.

The script:

1. builds the desktop main and preload code;
2. reuses the frontend dev server on `http://localhost:3000`, or starts and stops one itself;
3. launches Electron with a **throwaway profile**, so your own settings and recent projects are never touched;
4. creates the sample project in a temp folder, then screenshots each view at 1440×900.

Commits in the sample project use a made-up author, and your personal git config is ignored, so no personal details end up in the images.

On Linux the app runs off-screen. On macOS and Windows its window appears while the script works; don't use the mouse or keyboard until it finishes.

### Options

| Option | Effect |
|---|---|
| `--only=graph-group,tasks-board` | Capture only these shots (names without `.png`). |
| `--out=some/folder` | Write somewhere other than `docs/images` (handy for comparing). |
| `--headed` | Show the window on Linux too. |
| `--keep` | Keep the temp folder (sample project and profile) for inspection. |

If a step fails, the script saves a screenshot of the app at that moment to your temp folder and prints its path.

## The sample project

`sample-project/` holds *The Emberfall Chronicles*, a small fantasy novel that matches the examples in the guides:

- `nodes/World/…`: characters, places and factions, tagged (`character`, `northern-reaches`, …) for the Group view example;
- `nodes/Story/…`: five chapters with `chapter`, `mira_tension` and `rowan_tension` for the Progression example, plus task dates and statuses for the Tasks views.
  - Dates are written as `{{date:+N}}` (N days from today), so the Calendar and To-Do views always have current content.
- `config/group-view.json` and `config/progression.json`: loaded through the views' own **Import JSON** and **Load Config** buttons.
- `config/mind-map.json`: hand-placed Mind Map positions for the pages. Folders are left where the app places them.

## Updating the screenshots

Re-run the script after UI changes and review the images before committing; `git diff --stat docs/images` shows which changed. If a view's buttons or labels change, update the matching step in `captureAll()` in `capture.mjs`.

To add a screenshot to a guide, reference it relative to the doc, like `![What it shows](images/name.png)`. The Help view loads images from `docs/images` on desktop and web.
