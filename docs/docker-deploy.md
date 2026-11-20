# Deploy with Docker

The web version of Verbweaver is in development, and the Docker Compose stack doesn't start cleanly yet (see Known issues). This guide describes what `docker-compose.yml` sets up. For a server you can run today, see [Install the Verbweaver Server](install-server.md).

## What's in the stack

| Service | Port | Notes |
|---|---|---|
| `backend` | 8000 | FastAPI, built from `backend/Dockerfile` |
| `frontend` | 3000 | the built frontend, served by Nginx inside the container |
| `postgres` | 5432 | PostgreSQL 15, user/password/database `verbweaver` |
| `redis` | 6379 | Redis 7, used for passkeys |
| `nginx` | 80, 443 | reverse proxy using `nginx/nginx.conf`; port 80 redirects to HTTPS |
| `migrate` | | `setup` profile only; runs Alembic (not working, see below) |

The backend depends on `postgres` and `redis`, so both always start.

## Run it

Requirements: Docker 24+ with the Compose plugin.

1. Put a certificate and key at `nginx/ssl/cert.pem` and `nginx/ssl/key.pem`. They aren't in the repository, and the `nginx` service needs them.
2. Create a `.env` file next to `docker-compose.yml` (there's no `.env.example`):

   ```bash
   SECRET_KEY=replace-with-a-generated-secret
   DEBUG=False
   ```

   Generate the secret with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
3. Start the stack:

   ```bash
   docker compose up -d
   ```

Then open `https://localhost`. The backend answers directly at `http://localhost:8000/health`.

Compose passes only `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY` and `DEBUG` to the backend. Add other settings from [the settings table](install-server.md#settings), such as OAuth credentials or `FRONTEND_URL`, to the `backend` service's `environment` list.

## Data

- Project repositories: `./git-repos` on the host (mounted at `/app/git-repos`).
- Uploads: `./uploads` on the host (mounted at `/app/uploads`).
- Database and Redis: the `postgres_data` and `redis_data` Docker volumes.

Back up `./git-repos`, `./uploads` and the database (`docker compose exec postgres pg_dump -U verbweaver verbweaver > backup.sql`).

## TLS

Either mount real certificates into `nginx/ssl/` (for example from Let's Encrypt), or terminate TLS in front of the stack, such as at a cloud load balancer, and adjust `nginx/nginx.conf`.

## Known issues

These are tracked in issue #117:

- The backend image doesn't include `asyncpg`, which the `postgresql+asyncpg://` database URL needs, so the backend fails to start against PostgreSQL. Until it's fixed, add `asyncpg` to `backend/requirements.txt` before building.
- The `migrate` service runs `alembic upgrade head`, but the repository has no Alembic configuration. Don't run it; the backend creates its tables on startup.
