# Getting Started with Verbweaver

This guide will help you get Verbweaver up and running on your system.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16.0.0 or higher) - [Download](https://nodejs.org/)
- **npm** (v8.0.0 or higher) - Comes with Node.js
- **Python** (3.8 or higher) - [Download](https://www.python.org/)
- **Git** - [Download](https://git-scm.com/)

## Installation Options

### Option 1: Desktop Application (Recommended for Writers)

Download the pre-built desktop application for your platform:

- **Windows**: Download `Verbweaver-Setup.exe` from [Releases](https://github.com/verbweaver/releases)
- **macOS**: Download `Verbweaver.dmg` from [Releases](https://github.com/verbweaver/releases)
- **Linux**: Download `Verbweaver.AppImage` from [Releases](https://github.com/verbweaver/releases)

### Option 2: Web Application (For Teams)

Use Docker Compose for the easiest setup:

```bash
# Clone the repository
git clone https://github.com/yourusername/verbweaver.git
cd verbweaver

# Start the application
docker-compose up -d

# Access the application at http://localhost:3000
```

### Option 3: Development Setup

For developers who want to contribute or customize Verbweaver:

#### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/verbweaver.git
cd verbweaver
```

#### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies for the backend
cd backend
pip install -r requirements.txt
cd ..
```

#### 3. Configure Environment

Create a `.env` file in the backend directory:

```bash
cd backend
cp .env.example .env
# Edit .env with your settings
cd ..
```

#### 4. Start Development Servers

```bash
# Start both backend and frontend
npm run dev

# Or start them separately:
# Terminal 1 - Backend
cd backend
python run_dev.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/api/v1/docs

## First Steps

### 1. Create Your First Project

1. Click "New Project" or use `Ctrl/Cmd + N`
2. Choose between:
   - **Local Repository**: Store your project on your computer
   - **Remote Repository**: Connect to GitHub, GitLab, or other Git hosting
3. Name your project and configure settings

### 2. Add Content

1. Navigate to the **Editor** view
2. Create your first Markdown file
3. Add metadata in the YAML header:

```markdown
---
id: my-first-note
title: My First Note
type: note
tags: [getting-started, tutorial]
---

# My First Note

Welcome to Verbweaver! Start writing here...
```

### 3. Create Relationships

1. Switch to the **Graph** view
2. Drag from one node to another to create links
3. Or add links in your Markdown:

```markdown
This note is related to [[another-note]].
```

### 4. Track Progress

1. Go to the **Threads** view
2. Convert any node into a task
3. Set status, assignee, and due dates
4. Track your progress visually

### 5. Export Your Work

1. Open the **Compiler** view
2. Select nodes to include
3. Choose export format (PDF, Word, etc.)
4. Configure options and export

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| New Project | Ctrl+N | Cmd+N |
| Open Project | Ctrl+O | Cmd+O |
| Save | Ctrl+S | Cmd+S |
| Search | Ctrl+P | Cmd+P |
| Toggle Sidebar | Ctrl+B | Cmd+B |
| New Tab | Ctrl+T | Cmd+T |
| Close Tab | Ctrl+W | Cmd+W |

## Configuration

### Project Settings

Each project has its own settings stored in `.verbweaver/config.yaml`:

```yaml
version: 1.0.0
structure:
  content: content
  tasks: tasks
  templates: templates
  exports: exports
settings:
  theme: dark
  autoSave: true
  gitAutoPush: false
```

### Global Settings

Access global settings via the Settings button in the sidebar:

- **Appearance**: Theme, font size, color profiles
- **Editor**: Tab size, word wrap, auto-save
- **Git**: Default author, auto-push preferences
- **Export**: Default formats, templates

## Troubleshooting

### Common Issues

**Backend won't start**
- Ensure Python 3.8+ is installed
- Check if port 8000 is available
- Verify all Python dependencies are installed

**Frontend build fails**
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Ensure Node.js 16+ is installed

**Git operations fail**
- Verify Git is installed and in PATH
- Check repository permissions
- Ensure Git credentials are configured

### Getting Help

- Check the [Documentation](README.md)
- Report issues on [GitHub](https://github.com/verbweaver/issues)
- Join our [Community Discord](https://discord.gg/verbweaver)

## Next Steps

- Read the [User Guide](user-guide/README.md) for detailed features
- Explore [Templates](templates/README.md) to jumpstart your projects
- Learn about [Advanced Features](advanced/README.md)
- Contribute to the project - see [Contributing](CONTRIBUTING.md) 