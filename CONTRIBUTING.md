# Contributing to Verbweaver

Thanks for helping improve Verbweaver. This page covers how to set up, what to check before opening a pull request, and how we work.

## Code of conduct

Be respectful and constructive, welcome newcomers, and accept feedback gracefully.

## Set up

Follow [Build from source](README.md#build-from-source) in the README. In short, on macOS or Linux:

```bash
git clone https://github.com/Verbweaver/verbweaver.git
cd verbweaver
./desktop/build-and-run.sh      # Windows: desktop\build-and-run.ps1
```

This installs the JavaScript workspaces (`shared`, `frontend`, `desktop`), creates a Python 3.11 to 3.13 virtual environment in `.venv` with the backend's requirements, and starts the desktop app in development mode.

Useful background:

- [CLAUDE.md](CLAUDE.md): a short tour of the code and the two runtime modes (desktop over IPC, web over HTTP).
- [DESIGN.md](DESIGN.md): the original product design.
- [dev-docs/](dev-docs/): architecture, API and release notes.

## How we work

1. **Start from an issue.** Check [existing issues](https://github.com/Verbweaver/verbweaver/issues) first, and open one for anything non-trivial so the approach can be agreed. Use the bug report or feature request template.
2. **Branch from the release branch.** Work for an upcoming release goes on that version's branch (for example `0.9.1`), not `main`. Name your branch after the issue, such as `75-docs-editing-pass`.
3. **Open a pull request into the release branch.** Reference the issue (`Closes #75`), describe what changed and how you tested it, and add screenshots for visible changes.

## Before you open a pull request

```bash
# Backend tests (install pytest into the venv once)
.venv/bin/python -m pip install pytest
cd backend && ../.venv/bin/python -m pytest

# Frontend
cd frontend && npm run lint && npm run type-check

# Desktop
cd desktop && npm run typecheck
```

There are no automated frontend or desktop tests yet, so try your change in the app, in both the desktop app and, where it applies, the web version. CI builds `shared` and `frontend` and runs the backend tests on every pull request.

If you change a page's layout or labels, refresh the Help screenshots with `npm run docs:screenshots` (see [scripts/help-screenshots](scripts/help-screenshots/README.md)) and update the matching guide in `docs/`.

## Code style

- **Python:** PEP 8, type hints, lines up to 100 characters. Formatting with `black` is encouraged.
- **TypeScript:** strict mode, ESLint rules, functional React components with hooks. Avoid `any` in new code.
- Put shared constants and types in `shared/src` rather than repeating them.
- A feature that touches project files usually needs changes in both runtime paths: the desktop IPC handlers in `desktop/src/main.ts` and the backend endpoints in `backend/app/api/v1/endpoints/`.

## Documentation

- User guides live in `docs/` and are shown in the app's Help. Write them for non-technical readers: short sentences, the labels people see on screen, and no jargon.
- `docs/help-docs.json` lists guides to hide in the desktop app or the web version.
- Developer notes go in `dev-docs/`, which isn't shipped with the app.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/Verbweaver/verbweaver/issues/new/choose). For bugs, include the steps to reproduce, what you expected, what happened, your operating system and Verbweaver version (shown on the **Support** page), and screenshots if they help.

## Getting help

Ask in an issue, or join the [Discord](https://discord.gg/aK3sBsBw).
