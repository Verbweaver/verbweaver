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

## 3) Backend bundling (desktop)
- [ ] PyInstaller spec not required (single‑file is fine), but verify imports resolve
- [ ] Local test: `cd backend && pyinstaller --onefile entry.py --name verbweaver-backend`
- [ ] Copy to `desktop/resources/backend/<platform>/verbweaver-backend[.exe]` (CI does this automatically)

## 4) Update workflows
- [ ] `.github/workflows/release-desktop.yml` builds backend binary, then packages Electron app and publishes to Releases
- [ ] `.github/workflows/publish-homebrew.yml`
  - [ ] Uses GitHub API to fetch DMG asset and compute sha256
  - [ ] Commits `Casks/verbweaver.rb` to tap repo
- [ ] `.github/workflows/publish-winget.yml`
  - [ ] URL points to `Verbweaver-v<tag>-x64.exe`
  - [ ] Opens/updates PR to winget‑pkgs

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
- [ ] `docker compose up -d` runs backend, frontend, postgres, redis, nginx
- [ ] Frontend: http://localhost:3000 loads
- [ ] Backend: http://localhost:8000/health (or API) responds
- [ ] Optional nginx at http://localhost proxies correctly

## 12) Security & hardening
- [ ] Secrets stored in GitHub Actions as repository or org secrets; least privilege
- [ ] Validate no plaintext secrets in repo or logs
- [ ] Confirm CSP and navigation protections in Electron main process
- [ ] Sign/notarize artifacts for public distribution

## 13) Housekeeping
- [ ] Update Help menu URLs to real repo/docs
- [ ] Keep previous installers available in Releases for rollback
- [ ] Verify FullCalendar assets render correctly in production build
- [ ] Document known issues / troubleshooting in `docs/install-desktop.md` and `docs/install-server.md`

---
When all boxes are checked, the release line is ready. Perform a final end‑to‑end install test on each OS (fresh VM if possible) before announcing.
