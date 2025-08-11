# Install Verbweaver Server (Native)

This guide covers installing the server natively with either SQLite (simple) or PostgreSQL (recommended for multi-user), plus reverse proxy and TLS.

## Prerequisites
- OS: Ubuntu 22.04+/Debian 12+/RHEL 9+ (reference), or macOS for development
- Python 3.11, Node.js 20+, Git
- Optional: PostgreSQL 15, Redis 7, Nginx or Caddy

## Backend (SQLite quick start)
1. Clone repo and create venv:
```
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
```
2. Install requirements:
```
pip install -r backend/requirements.txt
```
3. Run server:
```
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
SQLite default path: `./verbweaver.db`. Override via `DATABASE_URL`.

## Backend (PostgreSQL)
- Create a database and user
- Set `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname`
- Start server as above

## Frontend build and serve
```
cd frontend
npm ci
npm run build
```
Serve the `frontend/dist` directory via Nginx or any static server.

## Nginx reverse proxy
Example (HTTPS with certificates):
```
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
    proxy_pass http://127.0.0.1:8000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {
    root /var/www/verbweaver; # point to frontend/dist
    try_files $uri /index.html;
  }
}
```

## Let’s Encrypt automation
- Install certbot: `apt install certbot python3-certbot-nginx`
- Run: `certbot --nginx -d yourdomain.com`
- Auto-renew is configured via systemd timers by default

## systemd service (backend)
`/etc/systemd/system/verbweaver-backend.service`:
```
[Unit]
Description=Verbweaver Backend
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/verbweaver/backend
EnvironmentFile=/etc/verbweaver/backend.env
ExecStart=/opt/verbweaver/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```
Create `/etc/verbweaver/backend.env`:
```
DATABASE_URL=sqlite+aiosqlite:///./verbweaver.db
# For Postgres:
# DATABASE_URL=postgresql+asyncpg://verbweaver:verbweaver@localhost:5432/verbweaver
SECRET_KEY=change_me
BACKEND_CORS_ORIGINS=["https://yourdomain.com"]
GIT_PROJECTS_ROOT=/opt/verbweaver/git-repos
```
Enable and start:
```
sudo systemctl daemon-reload
sudo systemctl enable --now verbweaver-backend
```

## Proxies & offline
- Proxies: configure Nginx/Caddy as above; set `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` when building/installing.
- Offline installs: prepare a wheelhouse (pip download), and a prebuilt frontend `dist` tarball; host them on internal artifact storage.

## Redis (optional)
- If using realtime or caching, set `REDIS_URL=redis://localhost:6379/0`.


