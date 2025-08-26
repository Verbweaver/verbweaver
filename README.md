# Verbweaver

*Verbweaver* is a writing and design platform that thinks in relationships (graphs). It's designed for writers, artists, engineers, developers, analysts, and anyone who wants to design things while linking every idea together and turning those ideas into manageable tasks. Think and take notes in a way that is natural to you. Then, when it comes time to communicate your ideas or information to other people, use the Compiler and the powerful templating engine to generate a linear document in various common filetypes.

![Verbweaver Logo](docs/images/logo.png)

## 🌟 Features

- **Graph-based Design**: Visualize relationships between your ideas, documents, and tasks
- **Task Management**: Turn any idea into a trackable task with Kanban boards
- **Markdown-powered**: All content is stored as Markdown files with metadata headers. The [Pandoc Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown) format is used to enable exporting to many file formats using Pandoc with advanced formatting.
- **Write to your heart's content**: Use the built-in Editor or your favorite Markdown editor application to write chapter, notes, data, findings, or anything else.
- **Real-time Collaboration**: Work together with your team in real-time
- **Export Anywhere**: Compile your non-linear notes into linear documents (PDF, Word, ePub, etc.)
- **Git Version Control**: Built-in version control for all your projects
- **Multi-platform**: Available as a web app, desktop app (Windows, Mac, Linux), and mobile app (iOS, Android)

## 🏗️ Architecture

Verbweaver uses a modern, scalable architecture:

- **Backend**: Python with FastAPI, SQLAlchemy, and GitPython
- **Frontend**: React with TypeScript, Vite, and Tailwind CSS
- **Desktop**: Electron with secure IPC communication
- **Mobile**: React Native with shared business logic
- **Database**: SQLite (default) or PostgreSQL
- **Real-time**: WebSockets for collaboration

## 🚀 Getting Started

### 🖥️ Desktop Application (Recommended for Individual Writers)

The desktop application provides the best offline experience and bundles the frontend, a lightweight local backend, and default templates. It offers unique advantages:

#### Features
- **Offline Mode**: Work without internet connection
- **Local Storage**: Your data stays on your machine
- **Cross-platform**: Built with Electron, the desktop app works on Windows, MacOS, and Linux
- **Native Performance**: Faster file operations and Git integration
- **System Integration**: Native file dialogs, system tray, auto-updates
- **No Authentication**: Start working immediately

#### Intalling the desktop app

Installers are available for each release:
- Windows: `.exe` installer
- macOS: `.dmg` installer  
- Linux: `.AppImage` (or `.deb` / `.rpm` installers)

#### Building the Desktop mode manually

Build from source (one-time setup):

```bash
# Clone
git clone https://github.com/TheWover/verbweaver.git
cd verbweaver

# Install workspace dependencies (root installs shared + frontend + desktop)
npm ci

# Build shared types and frontend (required before desktop packaging)
npm run build:shared
npm run build:frontend
```

Run in development (per platform)

##### Windows (PowerShell)
```powershell
# Terminal 1 — Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Desktop
cd desktop
npm install
npm run dev
```

For Windows, a convenient script to build and run the application in development mode is located at `desktop\build-and-run.ps1`.

##### macOS (zsh/bash)
```bash
# Terminal 1 — Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Desktop
cd desktop
npm install
npm run dev
```

##### Linux (bash)
```bash
# Terminal 1 — Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — Desktop
cd desktop
npm install
npm run dev
```

Notes:
- Packaged installers bundle and auto-start a platform-specific backend binary (no separate step needed).
- In development you should run the backend yourself (two terminals as shown above).
- Desktop packaging is handled by electron-builder. See scripts in `desktop/package.json` (`dist`, `dist:win`, `dist:mac`, `dist:linux`).

### Web Application (For Teams)

Perfect for collaboration and cloud access.

Quick start with Docker:

```bash
# From repo root
docker-compose up -d
```

Manual setup (separate terminals):

```bash
# Backend (FastAPI)
cd backend
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (Vite)
cd ../frontend
npm install
npm run dev  # serves at http://localhost:5173
```

#### 🔧 Web Server Configuration

Key configuration options can be set via environment variables:

Environment (backend):

```env
# .env
SECRET_KEY=change-me
DATABASE_URL=sqlite+aiosqlite:///./verbweaver.db
BACKEND_CORS_ORIGINS=http://localhost:5173

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GITHUB_CLIENT_ID=your-github-client-id
```

Using PostgreSQL instead of SQLite:

```env
# .env (PostgreSQL)
SECRET_KEY=change-me
# Async SQLAlchemy driver string using asyncpg
DATABASE_URL=postgresql+asyncpg://verbweaver:verbweaver@localhost:5432/verbweaver
BACKEND_CORS_ORIGINS=http://localhost:5173

# Optional Redis cache
REDIS_URL=redis://localhost:6379/0
```

See [.env.example](backend/.env.example) for all available options.

Notes:
- Ensure PostgreSQL is running locally and a database/user are created. For local dev:
  - user: `verbweaver`, password: `verbweaver`, db: `verbweaver`
- If you use `docker-compose up -d`, the compose file already provisions Postgres and Redis and points the backend to them.

### Development Setup

For detailed setup instructions, see the [Getting Started Guide](docs/getting-started.md).


If you are developing templates:
- Global/default templates are bundled under `assets/templates` and copied into desktop builds.
- The Compiler supports schema-driven variables and per-node variables; see `docs/compiler-template-system.md`.

## 🐳 Docker Deployment

Deploy Verbweaver using Docker:

```bash
docker-compose up -d
```

This will start:
- Backend API on port 8000
- Frontend on port 3000
- PostgreSQL database (optional)
- Redis for caching (optional)

## 📦 Project Structure

```
verbweaver/
├── assets/                          # Static assets bundled with apps
│   └── templates/
│       ├── compiler/                # Default compiler templates by format
│       │   ├── markdown/
│       │   ├── html/
│       │   ├── pdf/
│       │   ├── docx/
│       │   ├── epub/
│       │   └── odt/
│       └── nodes/                   # Default node templates
├── backend/                         # FastAPI backend
│   ├── app/
│   │   ├── api/                     # API endpoints
│   │   ├── core/                    # Config, security
│   │   ├── db/                      # Sessions, redis client
│   │   ├── models/                  # Database models
│   │   ├── schemas/                 # Pydantic schemas
│   │   └── services/                # Business logic (compiler, templates, git)
│   ├── tests/                       # Backend tests
│   └── requirements.txt
├── desktop/                         # Electron desktop app
│   ├── src/
│   │   ├── main/                    # Main process
│   │   └── preload/                 # Preload scripts
│   └── resources/                   # Icons, packaging resources, defaults
├── docs/                            # Documentation site and guides
├── frontend/                        # React + Vite frontend
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   └── views/
│   └── package.json
├── mobile/                          # React Native app (WIP)
├── nginx/                           # Reverse proxy configs
│   └── nginx.conf
├── shared/                          # Workspace with shared TS types/constants
│   ├── src/
│   │   ├── config.ts
│   │   ├── constants/
│   │   └── types/
│   └── package.json
├── docker-compose.yml               # Full-stack dev/deploy (backend, frontend, db, redis)
├── start-dev.ps1                    # Convenience dev scripts
├── start-dev.sh
└── README.md
```

## 📖 Documentation

Comprehensive documentation is available in the [docs](docs/) directory:

- [Getting Started Guide](docs/getting-started.md) - Installation and setup
- [Architecture Overview](docs/architecture.md) - System design
- [API Reference](docs/api-reference.md) - REST API documentation
- [User Guide](docs/user-guide.md) - How to use Verbweaver
- [Developer Guide](docs/developer-guide.md) - Contributing and development
- [Repository Paths](docs/repository-paths.md) - How project storage works
- [Deployment Guide](docs/deployment.md) - Production deployment

## 🧪 Testing

Run the test suites:

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test

# Desktop tests
cd desktop
npm test

# E2E tests
npm run test:e2e
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License + Commons Clause - see the [LICENSE](LICENSE) file for details.

The MIT License ensures that you have unrestricted rights to use, modify, and redistribute Verbweaver free of charge. However, the Commons Clause rider prohibits you from selling Verbweaver or a providing a service (such as a cloud-hosting solution) "whose value derives, entirely or substantially" from Verbweaver. If you wish to purchase a license exception to this clause, then please contact us with your offer.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) for the excellent Python web framework
- [React](https://reactjs.org/) for the UI library
- [React Flow](https://reactflow.dev/) for graph visualization
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editor
- [Electron](https://www.electronjs.org/) for cross-platform desktop apps
- [GitPython](https://gitpython.readthedocs.io/) for Git integration
- [FullCalendar](https://fullcalendar.io/) (core, daygrid) © Adam Shaw — MIT License. We redistribute CSS assets for offline availability. See license: https://fullcalendar.io/license/mit
- All our contributors and supporters!

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/TheWover/verbweaver/issues)
- **Discussions**: [GitHub Discussions](https://github.com/TheWover/verbweaver/discussions)
- **Discord**: [Join our community](https://discord.gg/verbweaver)
- **Email**: support@verbweaver.com

---

Built with ❤️ by the Verbweaver team
