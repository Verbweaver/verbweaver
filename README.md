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

### Prerequisites

- **Python 3.11+** (for backend)
- **Node.js 18+** and npm (for frontend)
- **Git** (for version control features)
- **Docker** (optional, for containerized deployment)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/verbweaver.git
   cd verbweaver
   ```

2. **Set up the backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   cp .env.example .env  # Edit .env with your settings
   python init_db.py
   ```

3. **Set up the frontend**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Start the development servers**
   
   From the project root:
   ```bash
   # Windows PowerShell
   .\start-dev.ps1
   
   # Linux/Mac
   ./start-dev.sh
   ```

   Or manually:
   ```bash
   # Terminal 1 - Backend
   cd backend
   python -m uvicorn main:app --reload
   
   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/api/v1/docs

## 📖 Documentation

Comprehensive documentation is available in the [docs](docs/) directory:

- [Getting Started Guide](docs/getting-started.md)
- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [Deployment Guide](docs/deployment.md)

## 🏗️ Architecture

Verbweaver uses a modern, scalable architecture:

- **Backend**: Python with FastAPI, SQLAlchemy, and GitPython
- **Frontend**: React with TypeScript, Vite, and Tailwind CSS
- **Desktop**: Electron
- **Mobile**: React Native
- **Database**: SQLite (default) or PostgreSQL
- **Real-time**: WebSockets for collaboration

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

## 🧪 Testing

Run the test suites:

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) for the excellent Python web framework
- [React](https://reactjs.org/) for the UI library
- [React Flow](https://reactflow.dev/) for graph visualization
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) for the code editor
- [GitPython](https://gitpython.readthedocs.io/) for Git integration
- All our contributors and supporters!

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/verbweaver/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/verbweaver/discussions)
- **Email**: support@verbweaver.com

---

Built with ❤️ by the Verbweaver team
