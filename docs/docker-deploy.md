# Deploy with Docker

This guide uses docker-compose to run the full stack: backend (FastAPI), frontend (static), PostgreSQL, Redis, and Nginx.

## Prerequisites
- Docker 24+
- docker compose plugin

## Quick start
```
cp .env.example .env  # create if needed
docker compose up -d
```
Services:
- backend: http://localhost:8000
- frontend: http://localhost:3000
- nginx (optional reverse proxy): http://localhost

## Configuration
- Edit `docker-compose.yml` environments:
  - `DATABASE_URL` (PostgreSQL): `postgresql+asyncpg://verbweaver:verbweaver@postgres:5432/verbweaver`
  - `SECRET_KEY`: set to a strong secret
  - Volumes `git-repos` and `uploads` are mounted under `./git-repos` and `./backend/uploads` (adjust as needed)

## TLS
- Mount certs into `nginx` container at `/etc/nginx/ssl`, reference them in `nginx/nginx.conf`.
- Or terminate TLS upstream (cloud load balancer), or use a companion like `nginx-proxy` + `letsencrypt-nginx-proxy-companion`.

## Migrations
If/when DB migrations are added, run:
```
docker compose --profile setup run migrate
```

## Backups
- Database: use `pg_dump` against the `postgres` container.
- git-repos/uploads: backup the bound host directories.


