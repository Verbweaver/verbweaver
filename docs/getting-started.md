# Getting Started with Verbweaver

Welcome to Verbweaver! This guide will help you get up and running quickly.

## Installation

### System Requirements

- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)
- **Python**: 3.11 or higher
- **Node.js**: 18.0 or higher
- **Git**: 2.30 or higher
- **Memory**: 4GB RAM minimum (8GB recommended)
- **Storage**: 2GB free space

### Development Setup

1. **Install Python**
   - Download from [python.org](https://python.org)
   - Ensure `pip` is installed and updated: `python -m pip install --upgrade pip`

2. **Install Node.js**
   - Download from [nodejs.org](https://nodejs.org)
   - Verify installation: `node --version` and `npm --version`

3. **Install Git**
   - Download from [git-scm.com](https://git-scm.com)
   - Configure Git:
     ```bash
     git config --global user.name "Your Name"
     git config --global user.email "your.email@example.com"
     ```

4. **Clone and Setup Verbweaver**
   ```bash
   git clone https://github.com/yourusername/verbweaver.git
   cd verbweaver
   
   # Backend setup
   cd backend
   python -m venv venv
   # Windows: venv\Scripts\activate
   # Linux/Mac: source venv/bin/activate
   pip install -r requirements.txt
   
   # Frontend setup
   cd ../frontend
   npm install
   ```

## First Run

1. **Configure the Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your settings
   
   # Initialize the database
   python init_db.py
   ```

2. **Start the Servers**
   ```bash
   # From project root
   # Windows:
   .\start-dev.ps1
   
   # Linux/Mac:
   ./start-dev.sh
   ```

3. **Access Verbweaver**
   - Open http://localhost:5173 in your browser
   - The API is available at http://localhost:8000

## Creating Your First Project

1. **Sign Up** (Web version only)
   - Click "Sign Up" and create an account
   - Verify your email address

2. **Create a Project**
   - Click "New Project"
   - Enter project name and description
   - Choose a Git repository location

3. **Start Creating**
   - Use the Graph view to create nodes
   - Switch to Editor view to write content
   - Create tasks in the Threads view

## Basic Concepts

### Nodes
- Each file in your project is a "node"
- Nodes can be documents, images, or any file type
- Markdown files have special metadata headers

### Links
- **Hard Links**: Structural relationships (folders/files)
- **Soft Links**: Content relationships you define

### Views
- **Graph**: Visual representation of your project
- **Editor**: Write and edit files
- **Threads**: Task management
- **Version Control**: Git history and operations
- **Compiler**: Export your project

## Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|--------------|-------|
| New Tab | Ctrl+T | Cmd+T |
| Close Tab | Ctrl+W | Cmd+W |
| Save | Ctrl+S | Cmd+S |
| Search | Ctrl+F | Cmd+F |
| Graph View | Ctrl+1 | Cmd+1 |
| Editor View | Ctrl+2 | Cmd+2 |
| Threads View | Ctrl+3 | Cmd+3 |

## Next Steps

- Read the [User Guide](user-guide.md) for detailed features
- Check the [API Reference](api-reference.md) for automation
- Join our [community](https://github.com/yourusername/verbweaver/discussions)

## Troubleshooting

### Common Issues

**Backend won't start**
- Check Python version: `python --version`
- Ensure virtual environment is activated
- Check `.env` file exists and is configured

**Frontend won't start**
- Check Node version: `node --version`
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and reinstall: `npm install`

**Database errors**
- Delete `verbweaver.db` and run `python init_db.py` again
- Check file permissions in the backend directory

For more help, see our [FAQ](faq.md) or [open an issue](https://github.com/yourusername/verbweaver/issues). 