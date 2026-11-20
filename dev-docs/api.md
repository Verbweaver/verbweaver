# Backend API

The FastAPI backend serves everything under `/api/v1`. The desktop app starts its own copy on `127.0.0.1` (a free port from 8000 to 8099) and uses it for the Compiler, preview and templates; most other desktop features go through Electron IPC instead (see [architecture.md](architecture.md)).

The web server mode is in development, so routes change. Treat the generated reference as the source of truth:

- Swagger UI: `/api/v1/docs`
- ReDoc: `/api/v1/redoc`
- OpenAPI schema: `/api/v1/openapi.json`

Note: the Swagger UI at `/api/v1/docs` shadows `GET /api/v1/docs` of the Help docs router (`endpoints/docs.py`), so the web Help list request gets HTML instead of JSON (see issue #120).

## Routers

Mounted in `backend/app/api/v1/api.py` under `/api/v1`:

| Prefix | Module | Purpose |
|---|---|---|
| `/auth` | `endpoints/auth.py` | register, login, refresh, me, logout, password reset |
| `/users` | `endpoints/users.py` | `GET`/`PUT /users/me/preferences` |
| `/projects` | `endpoints/projects.py` | project CRUD, project settings, template re-seed |
| `/projects/{project_id}/graph`, `/nodes`, `/edges`, `/folders` | `app/api/endpoints/graph.py` | the graph, nodes (addressed by path), links and folders |
| `/git` | `endpoints/git.py` | revert and hard reset over HTTP |
| `/editor` | `endpoints/editor.py` | `/editor/{project_id}/files/...`, `/tree`, `/search` |
| `/compiler` | `endpoints/compiler.py` | `POST /compiler/{project_id}/compile` returns the exported file |
| `/templates` | `endpoints/templates.py` | global templates (`/templates/global`) and per-project templates |
| `/docs` | `endpoints/docs.py` | bundled Help docs and their images |
| `/preview` | `endpoints/preview.py` | Markdown preview through Pandoc |
| `/oauth`, `/passkey` | `endpoints/oauth.py`, `endpoints/passkey.py` | Google/GitHub login and passkeys |
| `/tasks` | `endpoints/tasks.py` | placeholder, no routes yet |

`backend/app/main.py` mounts the OAuth and passkey routers a second time under `/auth`, so they answer on two prefixes (see issue #118).

`GET /health` and `GET /api/v1/health` return `{"status": "healthy"}`.

## Authentication

1. Log in with a form-encoded body (OAuth2 password flow; `username` is the email):

   ```http
   POST /api/v1/auth/login
   Content-Type: application/x-www-form-urlencoded

   username=user@example.com&password=yourpassword
   ```

   The response contains `access_token`, `refresh_token`, `token_type` and `user`.

2. Send `Authorization: Bearer <access_token>` with each request. Access tokens last 30 minutes.

3. Refresh with a JSON body. Refresh tokens roll: each call returns a new pair.

   ```http
   POST /api/v1/auth/refresh
   Content-Type: application/json

   {"refresh_token": "..."}
   ```

Errors use FastAPI's default body: `{"detail": "..."}`.

## WebSocket

`/ws/{project_id}?token=<access_token>` sends JSON messages for one project:

| `type` | Direction | Meaning |
|---|---|---|
| `connection` | server to client | `status` is `connected` (with `project_id`, `user_id`) or `disconnected` |
| `file_change` | server to client | a file in the project changed |
| `ping` / `pong` | client sends `ping`, server answers `pong` | keep-alive |
| `refresh` / `refresh_required` | client sends `refresh`, server broadcasts `refresh_required` | ask every client to reload |
| `error` | server to client | the client sent invalid JSON |
