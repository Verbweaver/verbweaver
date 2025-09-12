# Contributing to Verbweaver

Thank you for your interest in contributing to Verbweaver! We welcome contributions from the community.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Accept feedback gracefully

## 🚀 Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/Verbweaver/verbweaver.git
   cd verbweaver
   ```

2. **Set up development environment**
   - Follow the [Getting Started Guide](docs/getting-started.md)
   - Install all dependencies
   - Run tests to ensure everything works

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📝 Development Process

### 1. Before You Start

- Check existing [issues](https://github.com/Verbweaver/verbweaver/issues) and [pull requests](https://github.com/verbweaver/Verbweaver/pulls)
- For major changes, open an issue first to discuss
- Ensure your idea aligns with the project's goals

### 2. Development Guidelines

#### Code Style

**Python (Backend)**
- Follow PEP 8
- Use type hints
- Maximum line length: 100 characters
- Run `black` for formatting

**TypeScript (Frontend)**
- Use TypeScript strict mode
- Follow ESLint rules
- Use functional components with hooks
- Proper type definitions, no `any`

**General**
- Write self-documenting code
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable names

#### Documentation

- Document new features
- Add JSDoc/docstrings
- Update API documentation

### 4. Pull Request Process

1. **Run quality checks**
   ```bash
   # Format code
   npm run format
   
   # Lint
   npm run lint
   
   # Test
   npm test
   ```

2. **Create pull request**
   - Use a descriptive title
   - Reference related issues
   - Include screenshots for UI changes
   - List breaking changes

3. **PR Review**
   - Address reviewer feedback
   - Keep discussions focused
   - Update as needed

## 🏗️ Architecture Decisions

Major architectural changes should:
1. Be discussed in an issue first
2. Consider backward compatibility
3. Update architecture documentation

## 🐛 Reporting Issues

### Bug Reports

Include:
- Clear description
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Screenshots/logs if applicable

### Feature Requests

Include:
- Use case description
- Proposed solution
- Alternative solutions considered
- Mockups/diagrams if applicable

## 🔧 Development Setup Tips

### Backend

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install in development mode
pip install -e .
pip install -r requirements-dev.txt
```

### Frontend

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run Storybook (component development)
npm run storybook
```

### Database

```bash
# Run migrations
alembic upgrade head

# Create new migration
alembic revision -m "description"
```

## 📞 Getting Help

- **Discord**: [Join our community](https://discord.gg/aK3sBsBw)

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Given credit in the changelog

Thank you for contributing to Verbweaver! 