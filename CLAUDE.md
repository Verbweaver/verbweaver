# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Verbweaver is a graph-based writing/design platform. Every piece of content is a Markdown file with a YAML front-matter header inside a Git repo; the same file is simultaneously a **node** (Graph view), a **task** (Tasks/Kanban view), and a **document** (Editor view). The Compiler linearizes a chosen tree of nodes and exports via Pandoc (Tectonic for LaTeX/PDF). The **desktop (Electron) app is the shipping product (beta)**; the multi-user web server mode is unfinished WIP.

`DESIGN.md` is the original product spec (data model, views, hard vs. soft links, `<file>.metadata.md` sidecars for non-Markdown files) — consult it for intended behavior.

## Commands

npm workspaces at the root: `shared`, `frontend`, `desktop` (plus `backend`, which is Python).

```bash
npm ci                         # root install (all JS workspaces)
npm run build:shared           # MUST run before frontend/desktop builds — they import @verbweaver/shared from dist/
npm run build:frontend         # tsc + vite build -> frontend/dist
npm run lint                   # eslint across workspaces

# Backend (Python/FastAPI), from backend/
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run_dev.py              # uvicorn app.main:app --reload on :8000, uses dev_verbweaver.db; docs at /api/v1/docs
pytest                         # config in backend/pytest.ini (testpaths: tests and .)
pytest tests/test_compiler_multipass.py::test_unresolved_markers_option   # single test

# Frontend (web mode), from frontend/
npm run dev                    # Vite on :3000
npm run type-check

# Desktop dev, one command (Linux/macOS; Windows: desktop/build-and-run.ps1)
./desktop/build-and-run.sh     # deps, .venv, shared build, Vite on :3000, electron-vite dev

# Desktop, manually from desktop/ — needs the frontend dev server on :3000 and NODE_ENV=development,
# otherwise Electron takes the packaged path. Electron spawns the backend from <repo>/.venv unless SKIP_BACKEND=true.
NODE_ENV=development npm run dev
npm run typecheck
npm run dist:linux             # electron-builder package (also dist:win / dist:mac / dist:full:*)
```

Notes:
- There is no frontend or desktop test script; the only real tests are backend pytest (`backend/tests/`, `backend/test_backend.py`). CI (`.github/workflows/build.yml`) builds shared + frontend and runs `pytest -q`.
- Backend style per CONTRIBUTING: PEP 8, type hints, `black`, 100-char lines. TS: strict mode, functional components + hooks.
- `docker-compose up -d` runs the web stack (backend, frontend, Postgres, Redis) — WIP.

## Architecture

### Two runtime modes sharing one React frontend

The frontend (`frontend/src`) detects Electron via `window.electronAPI` (exposed by `desktop/src/preload.ts` through `contextBridge`) and branches throughout — in Zustand stores (`frontend/src/store/*Store.ts`), `api/client.ts`, and many components. When changing a feature, check **both** paths:

1. **Desktop/IPC path**: `desktop/src/main.ts` (~3k lines) implements file system, project create/open/reseed, graph load/update/create/delete, git ops, templates seeding, docs, dependency checks, etc. directly via `ipcMain.handle(...)` channels (`fs:*`, `project:*`, `graph:*`, `git:*`, …). `preload.ts` maps these to `electronAPI` methods; `desktop/src/global.d.ts` and `frontend/src/global.d.ts` type them. Adding an IPC feature means touching main.ts, preload.ts, and the frontend type declarations.
2. **HTTP path**: FastAPI backend under `/api/v1`. The desktop app *also* spawns the backend (dev: Python+uvicorn from `../backend` and its `.venv`; packaged: the PyInstaller binary `resources/backend/<platform>/verbweaver-backend` built from `backend/entry.py`) and `api/client.ts` rewrites its `baseURL` to the port the backend reports. Features like the Compiler go through HTTP even on desktop.

### Backend layout gotcha

`backend/app/main.py` mounts **`app/api/v1/api.py`** with routers from **`app/api/v1/endpoints/`** — that is the live API. `app/api/api.py` and `app/api/endpoints/` are an older parallel set; only `app/api/endpoints/graph.py` is still imported (as `graph_full`) by the v1 router. Edit the v1 endpoints unless you are working on graph.

Key backend pieces:
- `app/api/v1/endpoints/compiler.py` — compiler pipeline (multi-pass includes/variable resolution, `PandocExporter`).
- `app/services/template_service.py` — schema-driven compiler/node templates (see `docs/compiler-template-system.md`).
- `app/services/node_service.py` — front-matter parse/stringify, node CRUD, `.metadata.md` sidecars.
- `app/services/git_service.py` — GitPython wrapper.
- `app/core/config.py` — pydantic settings (`API_V1_STR`, `GIT_PROJECTS_ROOT`, DB URL, OAuth). Default DB is SQLite (`sqlite+aiosqlite`); Postgres via `asyncpg`. Auth (JWT, OAuth, passkeys) is only meaningful in web mode — desktop has no auth.

### Shared package

`shared/src` holds TS types (`GraphNode`, `GraphEdge`, …), constants, and `config.ts` (`getApiUrl`, `configManager`). Per DESIGN.md, constants belong in one place — put shared values here rather than duplicating them.

### Templates and bundled assets

Default node and compiler templates live in `assets/templates/` (`nodes/`, `compiler/<format>/`). electron-builder copies them into the app as `templates-defaults`, along with `docs/` (served in the in-app Help view; `docs/help-docs.json` hides guides per platform, and developer notes live in `dev-docs/`, which is not bundled), `frontend/dist` (as `renderer`), and `desktop/resources/tools/<os>/<arch>` (bundled external tools such as Pandoc/Tectonic; the release workflow prunes other platforms). Projects on disk follow the structure described in `docs/repository-paths.md` (`nodes/`, `templates/`, `.verbweaver/`).

### Releases

`.github/workflows/release-desktop.yml` builds the PyInstaller backend + electron-builder installers per OS; other `publish-*.yml` workflows handle deb/rpm, Homebrew, winget, Docker. See `dev-docs/RELEASE_CHECKLIST.md`. Version is kept in root `package.json` and `desktop/package.json`.
