# Verbweaver

A writing and design platform that thinks in relationships (graphs). Designed for writers, artists, engineers, developers, and analysts to organize ideas as interconnected nodes with Git-backed version control.

## 🚀 Features Implemented

### Core Features
- **Graph View**: Visual node-based organization using React Flow
  - Create, edit, and delete nodes
  - Connect nodes with edges
  - Multiple node types (character, scene, plot, research, theme)
  - Drag-and-drop positioning
  - Context menus for quick actions

- **Editor View**: Full-featured markdown editor using Monaco Editor
  - Syntax highlighting
  - Multi-tab support
  - File tree navigation
  - Auto-save functionality
  - Keyboard shortcuts

- **Task Management**: Kanban-style task board
  - Drag-and-drop between columns (To Do, In Progress, Review, Done)
  - Priority levels and due dates
  - Tags and assignee support
  - Real-time updates

- **Version Control**: Git integration
  - View commit history
  - Stage and commit changes
  - Branch management
  - Push/pull functionality
  - Visual diff viewer

- **Document Compiler**: Export to multiple formats
  - PDF, DOCX, ODT, EPUB, MOBI, HTML, Markdown
  - Customizable formatting options
  - Table of contents generation
  - Batch export capabilities

### Authentication & Security
- JWT-based authentication
- User registration and login
- Secure token refresh mechanism
- Protected routes
- Session management

### Real-time Collaboration
- WebSocket support for live updates
- User presence indicators
- Collaborative editing preparation
- Event-based synchronization

### Platform Support
- **Web**: React + TypeScript + Vite
- **Desktop**: Electron with secure IPC
- **Mobile**: React Native structure
- **Backend**: Python FastAPI

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLAlchemy with SQLite/PostgreSQL
- **Authentication**: JWT with python-jose
- **Git Integration**: GitPython
- **WebSockets**: FastAPI WebSocket support
- **Document Processing**: Pandoc, WeasyPrint, python-docx

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **UI Components**: Tailwind CSS + Custom components
- **Graph Visualization**: React Flow
- **Code Editor**: Monaco Editor
- **Drag & Drop**: react-beautiful-dnd

### Shared
- **Type Definitions**: TypeScript interfaces
- **Constants**: Centralized configuration
- **Utilities**: Common helper functions

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
├── shared/          # Shared TypeScript types
├── desktop/         # Electron desktop app
├── mobile/          # React Native mobile app
└── docs/           # Documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- Python 3.9+
- Git
- Docker (optional)

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Shared Module Setup
```bash
cd shared
npm install
npm run build
```

### Desktop App
```bash
cd desktop
npm install
npm run dev
```

## 🔧 Configuration

### Environment Variables

Backend (.env):
```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///./verbweaver.db
PROJECTS_DIR=./projects
```

Frontend (.env):
```
VITE_API_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws
```

## 📝 API Documentation

Once the backend is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🎯 Next Steps

- Complete mobile app screens
- Implement advanced graph algorithms
- Add AI-powered writing assistance
- Enhance real-time collaboration features
- Add plugin system
- Implement cloud sync
- Add more export formats
- Create comprehensive test suite
