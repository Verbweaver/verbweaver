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

### Mobile
- **Framework**: React Native
- **Navigation**: React Navigation
- **State**: Shared with web (Zustand)

## Core Components

### 1. Authentication Service
- Handles user registration, login, and session management
- Supports email/password and OAuth providers (Google, GitHub)
- Implements JWT with refresh tokens
- Password security with bcrypt and configurable policies

### 2. Project Management
- Creates and manages Git repositories
- Handles project metadata and settings
- Manages user permissions per project

### 3. Graph Engine
- Parses Markdown files to build node relationships
- Manages hard links (directory structure) and soft links (content references)
- Provides real-time graph updates via WebSockets
- Handles node positioning and styling

### 4. Editor Service
- File CRUD operations with Git integration
- Real-time collaborative editing (future feature)
- Syntax highlighting and auto-completion
- Markdown preview with custom renderers

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

### 7. Compiler Service
- Exports node collections to various formats
- Template engine for custom exports
- Pandoc integration for document conversion
- Background job processing for large exports

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

## Security Architecture

### Authentication & Authorization
- JWT tokens with short expiration
- Refresh token rotation
- Role-based access control (RBAC)
- Project-level permissions

### Data Protection
- HTTPS everywhere
- Input validation and sanitization
- SQL injection prevention via ORM
- XSS protection in React
- CSRF tokens for state-changing operations

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

### Monitoring & Observability
- Structured logging with correlation IDs
- Prometheus metrics
- Health check endpoints
- Error tracking with Sentry (optional)

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
├── shared/               # Shared types/constants
├── desktop/              # Electron app
└── mobile/               # React Native app
```

### Testing Strategy
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance tests for scalability
- Security tests for vulnerabilities

### CI/CD Pipeline
1. Code push triggers GitHub Actions
2. Run linters and formatters
3. Execute test suites
4. Build Docker images
5. Deploy to staging
6. Run E2E tests
7. Deploy to production (manual approval)

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

### Collaboration Features
- Operational Transform for real-time editing
- Presence indicators
- Voice/video integration
- Comment threads with notifications 