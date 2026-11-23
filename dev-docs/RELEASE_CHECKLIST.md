# Release Checklist

Steps to prepare, ship and verify a desktop release and the server packages.

## 0) Prerequisites
- [ ] Apple Developer Program account (Team ID noted)
- [ ] Windows code-signing certificate (PFX and password)
- [ ] GitHub permissions to create Releases and set Actions secrets
- [ ] Homebrew tap repository (e.g. `yourorg/homebrew-verbweaver`)
- [ ] winget identifier confirmed (`Verbweaver.Verbweaver`)
- [ ] A fork of `microsoft/winget-pkgs` under the Verbweaver org (the winget workflow opens its PRs from it)
- [ ] `Verbweaver.Verbweaver` already exists in winget-pkgs. The workflow only updates it, so submit the first version by hand (e.g. `komac new`)

## 1) GitHub Actions secrets
Signing steps are skipped when a secret is missing, so an unsigned build still succeeds. Check the secrets before tagging.

- [ ] Windows signing (`release-desktop.yml`)
  - [ ] `WIN_CSC_LINK` (URL or base64 of the PFX)
  - [ ] `WIN_CSC_KEY_PASSWORD`
- [ ] macOS signing and notarization (`release-desktop.yml`)
  - [ ] `CSC_LINK` (Developer ID Application certificate, base64 .p12)
  - [ ] `CSC_KEY_PASSWORD`
  - [ ] `APPLE_ID`
  - [ ] `APPLE_APP_SPECIFIC_PASSWORD`
  - [ ] `APPLE_TEAM_ID`
- [ ] Homebrew tap (`publish-homebrew.yml`)
  - [ ] `HOMEBREW_TAP_REPO`
  - [ ] `HOMEBREW_TAP_TOKEN` (token with push access to the tap)
- [ ] winget (`publish-winget.yml`)
  - [ ] `WINGET_TOKEN` (classic token with `public_repo` scope; if it is missing, the winget job is skipped)
- [ ] Docker Hub (`publish-docker.yml`; GHCR uses `GITHUB_TOKEN`)
  - [ ] `DOCKERHUB_ORG`
  - [ ] `DOCKERHUB_USERNAME`
  - [ ] `DOCKERHUB_TOKEN`

## 2) Artifact naming and packaging
- [ ] `desktop/package.json` `build` has
  - [ ] `artifactName: "Verbweaver-v${version}-${arch}.${ext}"` (macOS and Linux)
  - [ ] `nsis.artifactName: "Verbweaver-Setup-${version}.${ext}"` (Windows)
  - [ ] `publish: ["github"]`
  - [ ] `extraResources` includes `resources/backend`, `../docs` and `../assets/templates`
- [ ] Expected release assets:
  - [ ] Windows: `Verbweaver-Setup-X.Y.Z.exe`
  - [ ] macOS: `Verbweaver-vX.Y.Z-arm64.dmg` and `-x64.dmg`, plus the matching `.zip` files
  - [ ] Linux: `.AppImage`, `.deb` and `.rpm`
- [ ] Server packages: `verbweaver-backend_vX.Y.Z_amd64.deb` and `.rpm`, built by `publish-deb-rpm.yml`

## 3) Backend bundling (desktop)
- [ ] Local test: `cd backend && pyinstaller --onefile entry.py --name verbweaver-backend`
- [ ] CI copies it to `desktop/resources/backend/<platform>/verbweaver-backend[.exe]`

## 4) Workflows
- [ ] `build.yml` (CI) runs on PRs: shared and frontend build, backend `pytest`
- [ ] `release-desktop.yml` builds the backend binary, packages Electron per OS, builds the server packages (via `publish-deb-rpm.yml`) and creates a draft release with all of them
- [ ] `publish-homebrew.yml` fetches the arm64 and x64 DMG assets, computes their sha256 and commits `Casks/verbweaver.rb` to the tap
- [ ] `publish-winget.yml` opens or updates a PR to winget-pkgs
- [ ] `publish-docker.yml` pushes backend images to Docker Hub and GHCR when the release is published
- [ ] `publish-deb-rpm.yml` builds the server `.deb` and `.rpm`. It never creates or uploads to a release; `release-desktop.yml` adds them to the draft

## 5) Signing and notarization
- [ ] Windows: the installer is signed
- [ ] macOS: signed and notarized; the DMG opens; first run works
  - [ ] The "Verify macOS signature and notarization" step in `release-desktop.yml` passed for both arches
  - [ ] Release assets are the `.dmg`/`.zip` files themselves. Never re-upload a GitHub Actions artifact
        zip: `upload-artifact` replaces symlinks with copies, which invalidates the app's signature
        ("bundle format is ambiguous", see #32)
  - [ ] Manual spot check on a Mac (mount the DMG, or extract the ZIP with `ditto -x -k`, never `unzip`):
        ```bash
        codesign --verify --deep --strict --verbose=2 Verbweaver.app   # no output on success
        spctl --assess --type execute --verbose=2 Verbweaver.app       # "accepted, source=Notarized Developer ID"
        xcrun stapler validate Verbweaver.app                          # "The validate action worked!"
        ```

## 6) In-app updates
- [ ] Help → Check for Updates… shows release notes when an update exists
- [ ] Support → Check for Updates gives the same result
- [ ] The update downloads in the background, then the "Update Ready" prompt offers Restart Now / Later
- [ ] A published GitHub Release exists for the version under test
- [ ] The release has the metadata electron-updater reads; without it every check fails with a 404 (#17):
  - [ ] `latest.yml` (Windows)
  - [ ] `latest-mac.yml`, listing both the `-arm64` and `-x64` zips
  - [ ] `latest-linux.yml`
  - [ ] the matching `*.blockmap` files

## 7) Desktop data paths
- [ ] In Settings → Profile → Data Locations (Desktop), set overrides
  - [ ] Database URL (e.g. `sqlite+aiosqlite:///C:/Path/verbweaver.db`)
  - [ ] Git Projects Root
- [ ] Restart the app and confirm the backend uses them (`DATABASE_URL`, `GIT_PROJECTS_ROOT`)
- [ ] The desktop backend binds to `127.0.0.1:<port>` only and stops when the app exits

## 8) Local validation before tagging
- [ ] Build the backend binary (section 3)
- [ ] `npm ci && npm run build:shared && cd desktop && npm run dist:full:<os>`
- [ ] Install and launch on each OS; the backend starts and Help works offline
- [ ] Help lists no server docs in the desktop app (`docs/help-docs.json`)
- [ ] Refresh Help screenshots if the UI changed: `npm run docs:screenshots`, review `git diff --stat docs/images`, commit (see `scripts/help-screenshots/README.md`)
- [ ] Help guides show their screenshots in the installed app
- [ ] The **E2E (desktop app)** workflow passed for the `release-testing` push (Actions tab)
- [ ] If the template engine or Compiler page changed: `node scripts/compiler-stress/stress.mjs` reports no unexpected failures (see `dev-docs/testing.md`)

## 9) Release (tag)
- [ ] Set `version` in `desktop/package.json` and root `package.json` to `X.Y.Z`
- [ ] Create and push an annotated tag `vX.Y.Z`. Only `v*.*.*` tags run the release
      pipeline, and the `publish` job fails if the tag doesn't match `desktop/package.json`
- [ ] Never create the release or upload assets by hand. The `publish` job in
      `release-desktop.yml` creates a **draft** release with every installer, the server `.deb`/`.rpm`
      and the update metadata (section 6). Tags with a suffix (`vX.Y.Z-rc.1`) become prereleases
- [ ] Review the draft's assets, then publish it. Publishing triggers the Homebrew, winget and Docker workflows
- [ ] The Homebrew workflow pushed the updated cask
- [ ] The winget workflow created or updated its PR

## 10) Server (native) QA
- [ ] Default SQLite (`sqlite+aiosqlite:///./verbweaver.db`) works
- [ ] PostgreSQL (`postgresql+asyncpg://user:pass@host:5432/db`) works after `pip install asyncpg` (not in requirements, see issue #117)
- [ ] Nginx per `docs/install-server.md` proxies `/api/` and `/ws/` to the backend and serves the frontend at `/`
- [ ] `certbot --nginx -d yourdomain.com` obtains and renews certificates
- [ ] systemd service enabled, logs clean (`journalctl -u verbweaver-backend -f`)

## 11) Docker QA
- [ ] `docker pull $DOCKERHUB_ORG/verbweaver-backend:latest`
- [ ] `docker run -p 8000:8000 $DOCKERHUB_ORG/verbweaver-backend:latest` answers at http://localhost:8000/health
- [ ] `docker compose up -d` runs backend, frontend, postgres, redis and nginx (currently fails on the missing `asyncpg`, see issue #117)

## 12) Security
- [ ] Secrets live in GitHub Actions secrets, with least privilege
- [ ] No plaintext secrets in the repo or logs
- [ ] Desktop backend binds to 127.0.0.1 only
- [ ] Desktop app stops the backend on exit (no orphaned processes)

## 13) Housekeeping
- [ ] Previous installers stay available in Releases for rollback
- [ ] FullCalendar assets render in the production build
- [ ] Known issues documented in `docs/getting-started.md` (desktop) and `docs/install-server.md` (server)

## 14) OS repositories (optional, later)
- [ ] Choose apt/yum repo hosting (Cloudsmith or packagecloud)
- [ ] CI step to push `.deb`/`.rpm` to it on release
- [ ] Evaluate Open Build Service for official distro repos

Finish with an end-to-end install test on each OS (fresh VM if possible) before announcing.
