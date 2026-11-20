# Verbweaver Desktop

The Electron app that wraps the shared React frontend (`../frontend`) and runs the Python backend (`../backend`) in the background.

- `src/main.ts`: the main process. Starts the backend, builds the menus, and handles the IPC channels the frontend uses for files, projects, the graph, Git, templates, Help docs and dependency checks.
- `src/preload.ts`: exposes those channels to the frontend as `window.electronAPI`. Types are in `src/global.d.ts` and `../frontend/src/global.d.ts`.
- `resources/`: icons, macOS entitlements and the bundled Pandoc and Tectonic binaries (see [resources/README.md](resources/README.md)).

## Run in development

From the repo root, `./desktop/build-and-run.sh` (or `desktop\build-and-run.ps1` on Windows) does everything. To run it by hand, start the frontend dev server (`cd frontend && npm run dev`, port 3000), then:

```bash
cd desktop
NODE_ENV=development npm run dev
```

Without `NODE_ENV=development`, the app looks for the packaged frontend instead of the dev server. In development it starts the backend with the Python in `<repo>/.venv` or `backend/.venv`; set `SKIP_BACKEND=true` if you run the backend yourself on port 8000.

## Check and package

```bash
npm run typecheck
npm run dist:linux     # or dist:win, dist:mac; dist:full:* also builds the frontend
```

Installers are written to `dist-app/`. Packaged builds also need the PyInstaller backend in `resources/backend/<platform>/`, which the release workflow builds; see [the release checklist](../dev-docs/RELEASE_CHECKLIST.md).
