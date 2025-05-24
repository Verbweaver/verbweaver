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
   git clone https://github.com/yourusername/verbweaver.git
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

- Check existing [issues](https://github.com/verbweaver/verbweaver/issues) and [pull requests](https://github.com/verbweaver/verbweaver/pulls)
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

#### Testing

- Write tests for new features
- Maintain test coverage above 80%
- Run all tests before submitting PR
- Include both unit and integration tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm test
```

#### Documentation

- Update README if needed
- Document new features
- Add JSDoc/docstrings
- Update API documentation

### 3. Commit Messages

Follow conventional commits format:

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

Example:
```
feat(graph): add node filtering capability

- Add filter by node type
- Add search functionality
- Update GraphView component

Closes #123
```

### 4. Pull Request Process

1. **Update your branch**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run quality checks**
   ```bash
   # Format code
   npm run format
   
   # Lint
   npm run lint
   
   # Test
   npm test
   ```

3. **Create pull request**
   - Use a descriptive title
   - Reference related issues
   - Include screenshots for UI changes
   - List breaking changes

4. **PR Review**
   - Address reviewer feedback
   - Keep discussions focused
   - Update as needed

## 🏗️ Architecture Decisions

Major architectural changes should:
1. Be discussed in an issue first
2. Include an ADR (Architecture Decision Record)
3. Consider backward compatibility
4. Update architecture documentation

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

## 📦 Release Process

1. Update version numbers
2. Update CHANGELOG.md
3. Create release branch
4. Run full test suite
5. Build and test packages
6. Create GitHub release
7. Deploy to production

## 🎯 Priority Areas

Current areas where we especially welcome contributions:
- [ ] Mobile app improvements
- [ ] Performance optimizations
- [ ] Accessibility enhancements
- [ ] Documentation improvements
- [ ] Test coverage increase
- [ ] Bug fixes

## 📞 Getting Help

- **Discord**: [Join our community](https://discord.gg/verbweaver)
- **Discussions**: [GitHub Discussions](https://github.com/verbweaver/verbweaver/discussions)
- **Email**: dev@verbweaver.com

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Given credit in the changelog

Thank you for contributing to Verbweaver! 