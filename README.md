# Verbweaver

*Verbweaver* is a writing and design platform that thinks in relationships (graphs). It's designed for writers, artists, engineers, developers, analysts, and anyone who wants to design things while linking every idea together and turning those ideas into manageable tasks.

![Verbweaver Logo](docs/images/logo.png)

## 🌟 Features

- **Graph-based Design**: Visualize relationships between your ideas, documents, and tasks
- **Markdown-powered**: All content is stored as Markdown files with metadata headers
- **Git Version Control**: Built-in version control for all your projects
- **Task Management**: Turn any idea into a trackable task with Kanban boards
- **Multi-platform**: Available as a web app, desktop app (Windows, Mac, Linux), and mobile app (iOS, Android)
- **Real-time Collaboration**: Work together with your team in real-time
- **Export Anywhere**: Compile your non-linear notes into linear documents (PDF, Word, ePub, etc.)

## 🚀 Getting Started

### Desktop Application (Recommended for Individual Writers)

The desktop application provides the best offline experience:

```bash
# Clone and build from source
git clone https://github.com/yourusername/verbweaver.git
cd verbweaver

# Setup and run desktop app
cd desktop
npm install
npm run dev
```

Pre-built installers coming soon:
- Windows: `.exe` installer
- macOS: `.dmg` installer  
- Linux: `.AppImage`

### Web Application (For Teams)

Perfect for collaboration and cloud access:

```bash
# Quick start with Docker
docker-compose up -d

# Or run manually
cd backend && python -m uvicorn main:app --reload
cd frontend && npm run dev
```

### Development Setup

For detailed setup instructions, see the [Getting Started Guide](docs/getting-started.md).

### Prerequisites

- **Python 3.11+** (for backend)
- **Node.js 18+** and npm (for frontend)
- **Git** (for version control features)
- **Docker** (optional, for containerized deployment)

## 📦 Project Structure

```
verbweaver/
├── backend/          # FastAPI backend
│   ├── app/
│   │   ├── api/      # API endpoints
│   │   ├── core/     # Core functionality
│   │   ├── models/   # Database models
│   │   └── services/ # Business logic
│   └── requirements.txt
├── frontend/         # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   └── views/
│   └── package.json
├── desktop/         # Electron desktop app
│   ├── src/
│   │   ├── main/     # Main process
│   │   └── preload/  # Preload scripts
│   └── package.json
├── mobile/          # React Native mobile app
├── shared/          # Shared TypeScript types
└── docs/           # Documentation
```

## 🖥️ Desktop Application

The desktop version offers unique advantages:

### Features
- **Offline Mode**: Work without internet connection
- **Local Storage**: Your data stays on your machine
- **Native Performance**: Faster file operations and Git integration
- **System Integration**: Native file dialogs, system tray, auto-updates
- **No Authentication**: Start working immediately

### Building

```bash
# Development
cd desktop
npm run dev

# Build for current platform
npm run build

# Build for all platforms
npm run dist -- --win --mac --linux
```

## 🔧 Configuration

Key configuration options can be set via environment variables:

```env
# Backend
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite+aiosqlite:///./verbweaver.db
BACKEND_CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GITHUB_CLIENT_ID=your-github-client-id
```

See [.env.example](backend/.env.example) for all available options.

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

## 📖 Documentation

Comprehensive documentation is available in the [docs](docs/) directory:

- [Getting Started Guide](docs/getting-started.md) - Installation and setup
- [Architecture Overview](docs/architecture.md) - System design
- [API Reference](docs/api-reference.md) - REST API documentation
- [User Guide](docs/user-guide.md) - How to use Verbweaver
- [Developer Guide](docs/developer-guide.md) - Contributing and development
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

## 🏗️ Architecture

Verbweaver uses a modern, scalable architecture:

- **Backend**: Python with FastAPI, SQLAlchemy, and GitPython
- **Frontend**: React with TypeScript, Vite, and Tailwind CSS
- **Desktop**: Electron with secure IPC communication
- **Mobile**: React Native with shared business logic
- **Database**: SQLite (default) or PostgreSQL
- **Real-time**: WebSockets for collaboration

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) for the excellent Python web framework
- [React](https://reactjs.org/) for the UI library
- [React Flow](https://reactflow.dev/) for graph visualization
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editor
- [Electron](https://www.electronjs.org/) for cross-platform desktop apps
- [GitPython](https://gitpython.readthedocs.io/) for Git integration
- All our contributors and supporters!

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/verbweaver/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/verbweaver/discussions)
- **Discord**: [Join our community](https://discord.gg/verbweaver)
- **Email**: support@verbweaver.com

---

Built with ❤️ by the Verbweaver team
