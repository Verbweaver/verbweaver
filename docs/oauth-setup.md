# OAuth Login Setup

The web version of Verbweaver is in development. This guide sets up "Sign in with Google" and "Sign in with GitHub" for a server you run yourself (see [Install the Verbweaver Server](install-server.md)). The desktop app has no login and doesn't need this.

## Callback URLs

The backend sends the provider these callback URLs. Register them exactly:

| Provider | Callback URL |
|---|---|
| Google | `https://<your-domain>/api/v1/oauth/google/callback` |
| GitHub | `https://<your-domain>/api/v1/oauth/github/callback` |

- The backend builds the URL from the host the request arrived on, so `<your-domain>` is the public host behind Nginx, or `localhost:8000` when testing locally.
- When `DEBUG=False`, the backend rewrites `http://` to `https://` in these URLs, including for `localhost`. To test over plain `http://localhost:8000`, set `DEBUG=True` and register `http://localhost:8000/api/v1/oauth/google/callback` (and the GitHub equivalent).
- The same routes also answer under `/api/v1/auth/...`, but the backend always sends the `/api/v1/oauth/...` form (see issue #118).

After a successful login the backend redirects to `FRONTEND_URL/login` with the tokens, so `FRONTEND_URL` must be the frontend's public URL.

## Google

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Under **APIs & Services → OAuth consent screen**, choose **External**, fill in the app name and contact emails, and add the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. While the app is in testing, add your test users.
3. Under **APIs & Services → Credentials**, choose **Create Credentials → OAuth client ID**, application type **Web application**.
   - **Authorized JavaScript origins:** your frontend URL.
   - **Authorized redirect URIs:** the Google callback URL above.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## GitHub

1. In GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Set **Homepage URL** to your frontend URL and **Authorization callback URL** to the GitHub callback URL above.
3. Register the app, then **Generate a new client secret** and copy it straight away; GitHub shows it only once.
4. Copy the client ID and secret into `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

## Backend settings

Set these in the backend's environment or `backend/.env`, then restart the backend:

```bash
FRONTEND_URL=https://your-domain
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

A provider whose client ID isn't set returns an error when someone tries to use it.

The backend checks a `state` value during login to block forged callbacks, and keeps it in a session cookie. The secret for that cookie can't be configured yet and falls back to a built-in value (see issue #116). Keep client secrets out of version control.
