# Passkey Setup

The web version of Verbweaver is in development. Passkeys let people sign in to a Verbweaver server with a fingerprint, face or device PIN instead of a password. The desktop app has no login and doesn't need this.

Known issue: the frontend calls `/api/v1/passkey/...`, but the backend serves passkey routes at `/api/v1/passkey/passkey/...` and `/api/v1/auth/passkey/...`, so passkey sign-in currently fails with "not found" (see issue #118).

## Requirements

- A running server (see [Install the Verbweaver Server](install-server.md)).
- HTTPS in production. Browsers allow passkeys over plain HTTP only on `localhost`.
- Redis. The backend stores each sign-in challenge in Redis until it's used or expires.

## Settings

Set these in the backend's environment or `backend/.env`, then restart the backend:

```bash
# Your domain, without scheme or port
WEBAUTHN_RP_ID=yourdomain.com
# Name shown by the browser and the device
WEBAUTHN_RP_NAME=Verbweaver
# The frontend's exact origin, with scheme (and port if not 80/443). Defaults to FRONTEND_URL.
WEBAUTHN_EXPECTED_ORIGIN=https://yourdomain.com
# How long a challenge stays valid, in seconds
WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS=120
REDIS_URL=redis://localhost:6379/0
# With a password: redis://:yourpassword@localhost:6379/0
```

- `WEBAUTHN_RP_ID` scopes the passkeys. For a site at `https://app.example.com` it can be `app.example.com` or `example.com`. Never include `https://` or a port.
- `WEBAUTHN_EXPECTED_ORIGIN` must match the address bar origin exactly. For local development with the Vite dev server that's `http://localhost:3000`, with `WEBAUTHN_RP_ID=localhost` (the default).

The required Python packages (`webauthn`, `redis`) are in `backend/requirements.txt`. The `user_passkeys` table is created automatically when the backend starts.

## Using passkeys

Signed-in users add and remove passkeys in **Settings → Security**. On the login page, they can then sign in with a passkey instead of a password.
