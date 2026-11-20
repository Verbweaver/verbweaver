# Architecture

Verbweaver is one React frontend that runs in two modes:

- **Desktop (the shipping product, beta):** an Electron app. Most features talk to the Electron main process over IPC; the main process also starts a local FastAPI backend for the features that need it.
- **Web (in development):** the same frontend in a browser, talking only to the FastAPI backend over HTTP and a WebSocket.

Content always lives in a Git repository of Markdown files with YAML front matter. A file is at once a node (Graph), a task (Tasks) and a document (Editor). See `DESIGN.md` for the data model.

## Code layout

```
verbweaver/
├── frontend/src/      React app (Vite, TypeScript)
│   ├── pages/, views/, components/
│   ├── store/         Zustand stores; branch on window.electronAPI for desktop vs web
│   ├── api/, services/ HTTP clients (axios)
│   └── hooks/, utils/
├── desktop/src/       Electron
│   ├── main.ts        main process: windows, menus, IPC handlers, backend process, updater
│   ├── preload.ts     contextBridge: exposes window.electronAPI
│   └── global.d.ts    types for window.electronAPI
├── backend/app/       FastAPI
│   ├── main.py        app, middleware, routers, /ws/{project_id}
│   ├── api/v1/        live API (api.py + endpoints/); graph routes come from api/endpoints/graph.py
│   ├── services/      node, template, git and compiler logic
│   ├── core/config.py settings (environment variables)
│   └── db/, models/, schemas/, crud/
├── shared/src/        TypeScript types, constants and config shared by frontend and desktop
├── assets/templates/  default node, compiler and project templates
├── docs/              user guides, bundled into the app and shown in Help
└── dev-docs/          developer docs (not bundled)
```

## Stack

- **Frontend:** React 18, TypeScript, Vite, Zustand, Tailwind CSS, `@xyflow/react` (graph), Monaco (editor), axios, react-router (HashRouter on desktop, BrowserRouter on web).
- **Desktop:** Electron, electron-vite, electron-builder, electron-updater (GitHub releases), electron-store (settings and recent projects).
- **Backend:** FastAPI, async SQLAlchemy (SQLite by default; PostgreSQL via `asyncpg`), GitPython, Pandoc for preview and export, Tectonic or a LaTeX engine for PDF, JWT auth with OAuth (Google, GitHub) and passkeys (WebAuthn) in web mode.
- **Redis** (optional): only stores passkey challenges.

## Desktop

```
Electron main process (desktop/src/main.ts)
├── BrowserWindow: the React app (Vite dev server in development, bundled files when packaged)
├── IPC handlers: fs:*, project:*, graph:*, git:*, docs:*, dependencies:*, dialog:*, templates:*, ...
├── Backend process: FastAPI on 127.0.0.1, first free port from 8000 to 8099
│     dev: backend/ with the .venv Python and uvicorn; packaged: resources/backend/<platform>/verbweaver-backend
└── Auto-updater: Help → Check for Updates…
```

- File, project, graph and Git operations go through IPC. Git runs as the system `git` binary.
- The Compiler, Markdown preview and templates go through HTTP to the local backend; `frontend/src/api/client.ts` points at the port the backend reports.
- Packaged builds bundle Pandoc and Tectonic per OS and arch (`desktop/resources/tools/<os>/<arch>`).
- The desktop app has no login.

Adding an IPC feature means a handler in `main.ts`, a method in `preload.ts`, and types in both `desktop/src/global.d.ts` and `frontend/src/global.d.ts`:

```typescript
// desktop/src/main.ts
ipc.handle('git:commit', async (_, projectPath: string, message: string, files?: string[]) => { /* ... */ });

// desktop/src/preload.ts
gitCommit: (projectPath: string, message: string, files?: string[]) =>
  ipcRenderer.invoke('git:commit', projectPath, message, files),

// frontend
await window.electronAPI.gitCommit(projectPath, 'My commit', files);
```

Security settings: `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`. Navigation away from the app is blocked, and external `http(s)` links open in the system browser.

## Web

- The backend serves `/api/v1` (see [api.md](api.md)) and `/ws/{project_id}?token=...` for project change notifications.
- Projects are stored under `GIT_PROJECTS_ROOT/{project_id}` and filtered by owner (`user_id`); there are no per-project permissions yet.
- Auth: JWT access tokens (30 minutes) with rolling refresh tokens, bcrypt passwords, account lockout after failed logins, OAuth and passkeys.
- Compiling runs in the request and streams the file back.
- Deployment: [docs/install-server.md](../docs/install-server.md) (native) or [docs/docker-deploy.md](../docs/docker-deploy.md) (Docker Compose).

## Tests and CI

- Backend: `pytest` in `backend/` (`backend/tests/`). These are the only automated tests.
- `.github/workflows/build.yml` (CI) builds `shared` and `frontend` and runs `pytest`.
- Release workflows: see [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
