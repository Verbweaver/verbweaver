# Verbweaver Release & Installation Checklist

Use this as a step-by-step TODO to prepare, ship, and verify cross‑platform installers and server deployments.

## 0) Prerequisites
- [ ] Apple Developer Program account (Team ID noted)
- [ ] Windows code‑signing certificate (EV preferred) or standard PFX + password
- [ ] GitHub repo permissions to create Releases and set Actions secrets
- [ ] Homebrew tap repository (e.g., yourorg/homebrew-verbweaver)
- [ ] winget identifier confirmed (e.g., Verbweaver.Verbweaver)

## 1) CI/CD Secrets (GitHub Actions)
- [ ] Windows signing
  - [ ] WIN_CSC_LINK (URL or base64 of PFX)
  - [ ] WIN_CSC_KEY_PASSWORD
- [ ] macOS signing / notarization
  - [ ] APPLE_ID (Apple ID email)
  - [ ] APPLE_APP_SPECIFIC_PASSWORD
  - [ ] ASC_PROVIDER (team short name or ID)
- [ ] Homebrew tap
  - [ ] HOMEBREW_TAP_REPO (e.g., yourorg/homebrew-verbweaver)
  - [ ] HOMEBREW_TAP_TOKEN (PAT with push access to tap repo)
- [ ] Docker registries (optional but recommended)
  - [ ] DOCKERHUB_ORG (Docker Hub org/user for image name)
  - [ ] DOCKERHUB_USERNAME
  - [ ] DOCKERHUB_TOKEN
  - [ ] (GHCR uses GITHUB_TOKEN by default)
- [ ] Package signing (optional)
  - [ ] DEB_SIGNING_KEY (path or contents; optional)
  - [ ] RPM_SIGNING_KEY (path or contents; optional)

## 2) Artifact naming & packaging
- [ ] Confirm `desktop/package.json` has
  - [ ] `artifactName: "Verbweaver-v${version}-${arch}.${ext}"`
  - [ ] `publish: ["github"]`
  - [ ] `extraResources` includes `resources/backend → backend` and `../docs → docs`
  - [ ] Windows target arch set as expected (x64) and winget workflow matches
- [ ] Ensure release assets will be:
  - [ ] Windows: `Verbweaver-vX.Y.Z-x64.exe`
  - [ ] macOS: `Verbweaver-vX.Y.Z-<arch>.dmg` (Homebrew workflow auto‑detects DMG asset)
  - [ ] Linux: AppImage/deb/rpm (names may include arch; OK)
 - [ ] Server packages: `.deb` and `.rpm` uploaded by the server packaging workflow

## 3) Backend bundling (desktop)
- [ ] PyInstaller spec not required (single‑file is fine), but verify imports resolve
- [ ] Local test: `cd backend && pyinstaller --onefile entry.py --name verbweaver-backend`
- [ ] Copy to `desktop/resources/backend/<platform>/verbweaver-backend[.exe]` (CI does this automatically)

## 4) Update workflows
- [ ] `.github/workflows/CI` (formerly `build.yml`) runs PR checks (frontend build/typecheck, backend tests)
- [ ] `.github/workflows/release-desktop.yml` builds backend binary, then packages Electron app and publishes to Releases
- [ ] `.github/workflows/publish-homebrew.yml`
  - [ ] Uses GitHub API to fetch DMG asset and compute sha256
  - [ ] Commits `Casks/verbweaver.rb` to tap repo
- [ ] `.github/workflows/publish-winget.yml`
  - [ ] URL points to `Verbweaver-v<tag>-x64.exe`
  - [ ] Opens/updates PR to winget‑pkgs
- [ ] `.github/workflows/publish-docker.yml`
  - [ ] Publishes backend images to Docker Hub and/or GHCR on `v*.*.*` tags (latest + semver tags)
- [ ] `.github/workflows/publish-deb-rpm.yml`
  - [ ] Builds and uploads `verbweaver-backend` `.deb` and `.rpm` to the GitHub Release

## 5) Signing & notarization
- [ ] Windows: verify installer is signed (SmartScreen friendly if EV)
- [ ] macOS: verify app is signed and notarized; DMG opens; first run OK

## 6) In‑app updates
- [ ] Help → “Check for Updates…” shows release notes when available
- [ ] Update downloads silently; “Restart to update” prompt appears after download
- [ ] A published GitHub Release exists for the version under test

## 7) Preferences (Desktop) – data paths
- [ ] In Settings → Appearance, set optional overrides
  - [ ] Database URL (e.g., `sqlite+aiosqlite:///C:/Path/verbweaver.db`)
  - [ ] Git Projects Root
- [ ] Verify backend reads envs `DATABASE_URL` and `GIT_PROJECTS_ROOT` (launch app and test)
- [ ] Confirm desktop backend binds to `127.0.0.1:<port>` only and terminates when the app exits

## 8) Local validation before tagging
- [ ] Build backend binary locally (section 3)
- [ ] `cd desktop && npm ci && npm run build && npm run dist:<os>`
- [ ] Install and launch on each OS; confirm backend spawns, Help docs visible offline

## 9) Release pipeline dry‑run (tag)
- [ ] Create annotated tag `vX.Y.Z` and push
- [ ] Confirm desktop builds for Windows/macOS/Linux publish to GitHub Releases
- [ ] Verify Homebrew workflow pushed updated cask (tap repo)
- [ ] Verify winget workflow created/updated PR in winget‑pkgs

## 10) Server (native) install QA
- [ ] SQLite path: default `sqlite+aiosqlite:///./verbweaver.db` works
- [ ] PostgreSQL: `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db` works
- [ ] Nginx reverse proxy per `docs/install-server.md` routes `/api` to backend and serves frontend at `/`
- [ ] Let’s Encrypt: `certbot --nginx -d yourdomain.com` obtains/renews certs
- [ ] systemd service installed, `enable --now`, logs clean (`journalctl -u verbweaver-backend -f`)

## 11) Docker deployment QA
- [ ] Pull image from Docker Hub or GHCR (e.g., `docker pull $DOCKERHUB_ORG/verbweaver-backend:latest`)
- [ ] `docker run -p 8000:8000 $DOCKERHUB_ORG/verbweaver-backend:latest` responds at http://localhost:8000/health
- [ ] `docker compose up -d` (if using the provided compose file) runs backend, frontend, postgres, redis, nginx
- [ ] Frontend: http://localhost loads
- [ ] Optional nginx at http://localhost proxies correctly

## 12) Security & hardening
- [ ] Secrets stored in GitHub Actions as repository or org secrets; least privilege
- [ ] Validate no plaintext secrets in repo or logs
- [ ] Confirm CSP and navigation protections in Electron main process
- [ ] Sign/notarize artifacts for public distribution
 - [ ] Desktop backend binds to 127.0.0.1 only (not network‑exposed)
 - [ ] Desktop app stops the backend process on exit (no orphaned processes)

## 13) Housekeeping
- [ ] Update Help menu URLs to real repo/docs
- [ ] Keep previous installers available in Releases for rollback
- [ ] Verify FullCalendar assets render correctly in production build
- [ ] Document known issues / troubleshooting in `docs/install-desktop.md` and `docs/install-server.md`

## 14) OS repository distribution (optional)
- [ ] Decide on managed repo hosting (Cloudsmith or packagecloud) for apt/yum repos
- [ ] Create CI step to push built `.deb`/`.rpm` to the hosted repos on release
- [ ] (Longer‑term) Evaluate Open Build Service (OBS) for publishing into official distro repos

---
When all boxes are checked, the release line is ready. Perform a final end‑to‑end install test on each OS (fresh VM if possible) before announcing.
