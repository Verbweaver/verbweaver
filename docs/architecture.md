# Architecture Overview

Verbweaver is built as a modern, scalable application using a microservices-inspired architecture with clear separation of concerns.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           Clients                                │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│  Web Browser │   Desktop    │    Mobile    │   API Clients     │
│   (React)    │  (Electron)  │ (React Native│    (REST/WS)      │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────────┘
       │              │              │               │
       └──────────────┴──────────────┴───────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Load Balancer │
                    │     (Nginx)     │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                ▼                         ▼
        ┌──────────────┐         ┌──────────────┐
        │  Web Server  │         │  API Server  │
        │   (Static)   │         │  (FastAPI)   │
        └──────────────┘         └──────┬───────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
            │   Database   │   │     Git      │   │    Redis     │
            │  (SQLite/    │   │ Repositories │   │   (Cache)    │
            │  PostgreSQL) │   │              │   │              │
            └──────────────┘   └──────────────┘   └──────────────┘
```

## Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: SQLAlchemy with SQLite/PostgreSQL
- **Authentication**: JWT with OAuth2 support
- **Git Integration**: GitPython
- **WebSockets**: FastAPI WebSockets
- **Task Queue**: Celery (optional)
- **Cache**: Redis (optional)

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Graph Visualization**: React Flow
- **Editor**: Monaco Editor
- **HTTP Client**: Axios
- **WebSocket Client**: Native WebSocket API

### Desktop
- **Framework**: Electron
- **IPC**: Electron IPC with typed channels
- **Auto-updater**: electron-updater
- **Embedded Backend**: Python server via child process
- **Storage**: electron-store for settings
- **Build**: electron-builder

### Mobile
- **Framework**: React Native
- **Navigation**: React Navigation
- **State**: Shared with web (Zustand)

## Desktop Application Architecture

The desktop application uses a unique architecture that embeds the backend server:

```
┌─────────────────────────────────────────────┐
│            Electron Main Process            │
├─────────────────────────────────────────────┤
│  • Window Management                        │
│  • IPC Handler                              │
│  • Backend Process Manager                  │
│  • Auto Updater                            │
│  • System Integration                       │
└──────────────┬──────────────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
┌─────────────┐   ┌─────────────┐
│  Renderer   │   │  Backend    │
│  Process    │   │  Process    │
├─────────────┤   ├─────────────┤
│ React App   │   │ FastAPI     │
│ (Frontend)  │   │ Server      │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                │
                ▼
        ┌───────────────┐
        │ Local SQLite  │
        │   Database    │
        └───────────────┘
```

### Desktop IPC Architecture

```typescript
// Main Process
ipcMain.handle('git:commit', async (event, message) => {
  return await gitService.commit(message);
});

// Renderer Process
const result = await ipcRenderer.invoke('git:commit', 'My commit');
```

### Desktop Security Model

1. **Context Isolation**: Renderer processes are isolated
2. **Node Integration**: Disabled in renderer
3. **Preload Scripts**: Secure bridge between main and renderer
4. **CSP Headers**: Strict content security policy
5. **Permissions**: Explicit permissions for file system access

## Core Components

### 1. Authentication Service
- Handles user registration, login, and session management
- Supports email/password and OAuth providers (Google, GitHub)
- Implements JWT with refresh tokens
- Password security with bcrypt and configurable policies
- Desktop app bypasses auth for local use

### 2. Project Management
- Creates and manages Git repositories
- Handles project metadata and settings
- Manages user permissions per project
- Desktop: Local project management without server

### 3. Graph Engine
- Parses Markdown files to build node relationships
- Manages hard links (directory structure) and soft links (content references)
- Provides real-time graph updates via WebSockets
- Handles node positioning and styling
- Desktop: Direct file system access for better performance

### 4. Editor Service
- File CRUD operations with Git integration
- Real-time collaborative editing (future feature)
- Syntax highlighting and auto-completion
- Markdown preview with custom renderers
- Desktop: Native file watching and faster I/O

### 5. Task Management
- Converts nodes to trackable tasks
- Kanban board with drag-and-drop
- Task metadata stored in Markdown headers
- Progress tracking and reporting

### 6. Version Control
- Git operations (commit, push, pull, diff)
- Visual diff viewer
- Branch management
- Conflict resolution UI
- Desktop: Direct Git binary integration

### 7. Compiler Service
- Exports node collections to various formats
- Template engine for custom exports
- Pandoc integration for document conversion
- Background job processing for large exports
- Desktop: Local processing without upload limits

## Data Flow

### 1. Authentication Flow
```
Client → API Gateway → Auth Service → Database
                            ↓
                    JWT Token Generation
                            ↓
                    Client (Store Token)
```

### 2. Real-time Updates
```
Client Action → API → Database Update
                 ↓
            WebSocket Broadcast
                 ↓
        All Connected Clients
```

### 3. File Operations
```
Editor Change → API → Git Working Directory
                 ↓
            Git Commit (Auto/Manual)
                 ↓
            Database Metadata Update
                 ↓
            Graph Update Broadcast
```

### 4. Desktop File Operations
```
Editor Change → IPC → Main Process
                 ↓
            Direct File Write
                 ↓
            Git Operations (Native)
                 ↓
            UI Update via IPC
```

## Security Architecture

### Authentication & Authorization
- JWT tokens with short expiration
- Refresh token rotation
- Role-based access control (RBAC)
- Project-level permissions
- Desktop: No auth, OS-level security

### Data Protection
- HTTPS everywhere
- Input validation and sanitization
- SQL injection prevention via ORM
- XSS protection in React
- CSRF tokens for state-changing operations
- Desktop: Local encryption options

### Password Security
- Bcrypt hashing with salt
- Configurable password policies
- Account lockout after failed attempts
- Password reset with time-limited tokens

## Scalability Considerations

### Horizontal Scaling
- Stateless API servers
- Session storage in Redis
- Load balancing with sticky sessions for WebSockets
- Separate read/write database connections

### Performance Optimizations
- Database query optimization with indexes
- Caching frequently accessed data
- Lazy loading for large graphs
- Pagination for list endpoints
- File streaming for large exports
- Desktop: Local caching, no network latency

### Monitoring & Observability
- Structured logging with correlation IDs
- Prometheus metrics
- Health check endpoints
- Error tracking with Sentry (optional)
- Desktop: Local logging and diagnostics

## Development Practices

### Code Organization
```
verbweaver/
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Core utilities
│   │   ├── db/           # Database models
│   │   ├── models/       # Domain models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # Business logic
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/        # Page components
│   │   ├── store/        # State management
│   │   ├── api/          # API clients
│   │   └── utils/        # Utilities
│   └── tests/
├── desktop/
│   ├── src/
│   │   ├── main/         # Main process code
│   │   ├── preload/      # Preload scripts
│   │   └── renderer/     # Renderer process
│   └── resources/        # Icons, installers
├── shared/               # Shared types/constants
└── mobile/               # React Native app
```

### Testing Strategy
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance tests for scalability
- Security tests for vulnerabilities
- Desktop: Native integration tests

### CI/CD Pipeline
1. Code push triggers GitHub Actions
2. Run linters and formatters
3. Execute test suites
4. Build Docker images
5. Build desktop apps for all platforms
6. Deploy to staging
7. Run E2E tests
8. Deploy to production (manual approval)
9. Release desktop builds

## Deployment Architecture

### Docker Compose (Development)
```yaml
services:
  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://...
  
  frontend:
    build: ./frontend
    depends_on:
      - backend
  
  postgres:
    image: postgres:15
  
  redis:
    image: redis:7
```

### Kubernetes (Production)
- Deployments for API and web servers
- StatefulSet for PostgreSQL
- Ingress for routing
- Horizontal Pod Autoscaler
- Persistent volumes for Git repos

### Desktop Distribution
- **Windows**: NSIS installer, auto-update via Squirrel
- **macOS**: DMG with auto-update via Sparkle
- **Linux**: AppImage, deb, rpm packages
- **Update Server**: Static file hosting or dedicated server

### Cloud Deployment Options
- **AWS**: ECS/EKS, RDS, ElastiCache, S3
- **GCP**: GKE, Cloud SQL, Memorystore, GCS
- **Azure**: AKS, Azure Database, Azure Cache, Blob Storage
- **Self-hosted**: Docker Swarm or Kubernetes

## Future Architecture Considerations

### Microservices Migration
- Extract compiler service
- Separate Git operations service
- Independent task management service
- Message queue for inter-service communication

### Performance Enhancements
- GraphQL for efficient data fetching
- Server-side rendering for SEO
- Edge caching with CDN
- WebAssembly for intensive computations
- Desktop: Native modules for performance

### Collaboration Features
- Operational Transform for real-time editing
- Presence indicators
- Voice/video integration
- Comment threads with notifications
- Desktop: P2P sync for offline collaboration 