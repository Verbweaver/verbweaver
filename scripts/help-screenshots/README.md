# Help screenshots

`capture.mjs` regenerates the screenshots used by the in-app Help guides (`docs/images/*.png`). It drives the desktop app with [Playwright](https://playwright.dev/docs/api/class-electron) and two small sample projects, so the shots are consistent and easy to refresh after UI changes.

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
4. creates the sample projects in a temp folder, then screenshots each view at 1440×900.

Commits in the sample projects use a made-up author, and your personal git config is ignored, so no personal details end up in the images.

On Linux the app runs off-screen. On macOS and Windows its window appears while the script works; don't use the mouse or keyboard until it finishes.

### Options

| Option | Effect |
|---|---|
| `--only=graph-group,tasks-board` | Capture only these shots (names without `.png`). |
| `--out=some/folder` | Write somewhere other than `docs/images` (handy for comparing). |
| `--headed` | Show the window on Linux too. |
| `--layout="Left to Right"` | Mind Map layout button to use (default `Top to Bottom`). |
| `--keep` | Keep the temp folder (sample projects and profile) for inspection. |

If a step fails, the script saves a screenshot of the app at that moment to your temp folder and prints its path.

## The sample projects

Two small projects match the examples in the guides.

`sample-project/` is *The Emberfall Chronicles*, a fantasy novel, used for most views:

- `nodes/World/…`: characters, places and factions, tagged (`character`, `northern-reaches`, …) for the Group view example.
- `nodes/Story/…`: five chapters with task dates and statuses for the Tasks views.
  - Dates are written as `{{date:+N}}` (N days from today), so the Calendar and To-Do views always have current content.
- `config/group-view.json`: loaded through the Group view's own **Import JSON** button.

`sample-plant-study/` is *Plant Growth Study*, used for the Mind Map (a deliberately simple map, arranged with the **Top to Bottom** layout; `--layout="Left to Right"` tries another) and for Progression:

- `nodes/Observations/…`: weekly pages with `week`, `height_cm` and `leaf_count`.
- `config/progression.json`: loaded through Progression's **Load Config** button.

## Updating the screenshots

Re-run the script after UI changes and review the images before committing; `git diff --stat docs/images` shows which changed. If a view's buttons or labels change, update the matching step in `captureAll()` in `capture.mjs`.

To add a screenshot to a guide, reference it relative to the doc, like `![What it shows](images/name.png)`. The Help view loads images from `docs/images` on desktop and web.
