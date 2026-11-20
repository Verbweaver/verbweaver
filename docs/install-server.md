# Install the Verbweaver Server

The web version of Verbweaver is in development and not ready for production use. This guide is for trying it out or helping develop it. For writing with Verbweaver today, use the desktop app.

The server is a FastAPI backend plus the React frontend as static files, usually behind Nginx. Related guides:

- [Deploy with Docker](docker-deploy.md)
- [OAuth Login Setup](oauth-setup.md)
- [Passkey Setup](passkey-setup.md)

## Requirements

- Linux (Ubuntu 22.04+, Debian 12+ or RHEL 9+), or Windows/macOS for development
- Python 3.11+, Node.js 22.13+, Git, Pandoc
- Optional: PostgreSQL 15, Redis 7 (only needed for passkeys), Nginx or Caddy

## Backend

From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Tables are created automatically on startup. The database defaults to SQLite at `./verbweaver.db` (relative to where the server starts).

### PostgreSQL

The `asyncpg` driver isn't in `requirements.txt` yet (see issue #117), so install it yourself:

```bash
pip install asyncpg
export DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
```

The URL must use `postgresql+asyncpg://`; a plain `postgresql://` URL doesn't work with the async engine.

### Settings

There is no `.env.example`. Set these as environment variables, or in `backend/.env` (read when the server starts from `backend/`). Names are case-sensitive.

| Variable | Default | Notes |
|---|---|---|
| `DEBUG` | `False` | Keep `False` in production. |
| `SECRET_KEY` | random on each start | Signs login tokens. Set a fixed value, or everyone is logged out on restart. |
| `DATABASE_URL` | `sqlite+aiosqlite:///./verbweaver.db` | See PostgreSQL above. |
| `GIT_PROJECTS_ROOT` | `./git-repos` | Where project repositories are stored, one folder per project ID. |
| `FRONTEND_URL` | `http://localhost:3000` | Public URL of the frontend. |
| `REDIS_URL` | not set | Needed only for passkeys. |
| `GLOBAL_TEMPLATES_DIR` | under `DATA_DIR` (`./app_data`) | Default templates copied into new projects. |
| `PANDOC_PATH` | not set | Use a specific Pandoc binary. |
| `GOOGLE_*`, `GITHUB_*` | not set | See [OAuth Login Setup](oauth-setup.md). |
| `WEBAUTHN_*` | see guide | See [Passkey Setup](passkey-setup.md). |

The session secret used during OAuth logins can't be configured yet and falls back to a built-in value (see issue #116). `BACKEND_CORS_ORIGINS` is defined but not applied yet (see issue #121); allowed origins are fixed to `localhost:3000` and `localhost:5173` in `backend/app/main.py`. Behind Nginx on one domain this doesn't matter, because the frontend calls the API on the same origin (`/api/v1`).

## Frontend

```bash
npm ci
npm run build:shared
npm run build:frontend
```

Serve `frontend/dist` as static files. Served from any host other than `localhost`, the frontend calls the API at `/api/v1` on its own origin, so put both behind the same domain.

## Nginx

`location /api/` must keep the `/api` prefix: use `proxy_pass http://127.0.0.1:8000;` with no trailing slash. The WebSocket at `/ws/` needs the upgrade headers. `nginx/nginx.conf` in the repository is a fuller example (used by Docker Compose).

```nginx
server {
  listen 80;
  server_name yourdomain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name yourdomain.com;

  ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /ws/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {
    root /var/www/verbweaver;   # contents of frontend/dist
    try_files $uri /index.html;
  }
}
```

For certificates with Let's Encrypt: `apt install certbot python3-certbot-nginx`, then `certbot --nginx -d yourdomain.com`. Renewal runs from a systemd timer.

## Run as a service

`/etc/systemd/system/verbweaver-backend.service`:

```ini
[Unit]
Description=Verbweaver Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/verbweaver/backend
EnvironmentFile=/etc/verbweaver/backend.env
ExecStart=/opt/verbweaver/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/verbweaver/backend.env`:

```bash
DEBUG=False
SECRET_KEY=replace-with-a-generated-secret
DATABASE_URL=sqlite+aiosqlite:////opt/verbweaver/data/verbweaver.db
GIT_PROJECTS_ROOT=/opt/verbweaver/git-repos
FRONTEND_URL=https://yourdomain.com
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now verbweaver-backend
journalctl -u verbweaver-backend -f
```

## Before going live

1. Generate a secret and set it as `SECRET_KEY`:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. Set `DEBUG=False`. This also makes OAuth callback URLs use `https://`.
3. Use `postgresql+asyncpg://` for `DATABASE_URL` if you use PostgreSQL.
4. Bind the backend to `127.0.0.1` and expose it only through Nginx with HTTPS.
5. Check dependencies for known vulnerabilities:

   ```bash
   pip install pip-audit && pip-audit -r backend/requirements.txt
   npm audit
   ```

6. Back up the database and `GIT_PROJECTS_ROOT` regularly.

## Development

To run the backend (port 8000) and the Vite dev server (port 3000) together, run `./start-dev.sh` (Linux, macOS) or `.\start-dev.ps1` (Windows) from the repository root.
