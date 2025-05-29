# Unified Model Implementation

This document describes the implementation of Verbweaver's unified model where nodes, tasks, and files are all the same underlying entity.

## Overview

The unified model ensures that:
- Every node in the graph is backed by a Markdown file with YAML front matter
- Tasks are just nodes with task-specific metadata
- All changes are automatically version-controlled via Git
- Real-time synchronization occurs across all views when files change

## Architecture

### Backend Components

1. **NodeService** (`backend/app/services/node_service.py`)
   - Manages all node operations (CRUD) as Markdown files
   - Handles YAML front matter parsing and generation
   - Integrates with GitService for version control
   - Supports both Markdown files and non-Markdown files (using `.metadata.md`)

2. **Updated API Endpoints**
   - `/graph` - Uses NodeService to read/write nodes from Git
   - `/tasks` - Treats tasks as nodes with task metadata
   - `/editor` - Reads/writes files using NodeService
   - All endpoints now work with the same underlying data

3. **WebSocket Integration** (`backend/app/websocket.py`)
   - File watching using `watchdog` library
   - Notifies connected clients when Git repository changes
   - Supports automatic refresh across all views

### Frontend Components

1. **NodeStore** (`frontend/src/store/nodeStore.ts`)
   - Central store for managing all nodes
   - Supports both Electron (file system) and web (API) operations
   - Handles node filtering, searching, and relationships

2. **WebSocket Service** (`frontend/src/services/websocket.ts`)
   - Connects to backend WebSocket for real-time updates
   - Automatically refreshes NodeStore when files change
   - Shows toast notifications for file changes

3. **Updated Views**
   - **Graph View**: Now uses NodeStore instead of GraphStore
   - **Editor View**: Works with nodes as files
   - **Threads View**: Tasks are nodes with task metadata
   - All views update automatically when underlying files change

## Data Model

### Node Structure

```typescript
interface VerbweaverNode {
  path: string;              // File path relative to project root
  name: string;              // File name
  isDirectory: boolean;      // True if it's a folder
  isMarkdown: boolean;       // True if it's a .md file
  metadata: MarkdownMetadata; // YAML front matter
  content: string | null;    // File content (for Markdown files)
  hardLinks: {               // Directory structure
    parent: string | null;
    children: string[];
  };
  softLinks: string[];       // User-defined relationships (node IDs)
  hasTask: boolean;          // True if metadata contains task info
  taskStatus?: TaskState;    // Task status if applicable
}
```

### Markdown File Format

```markdown
---
id: node-1234567890-abc123def
title: My Node Title
type: chapter
created: 2024-01-15T10:30:00Z
modified: 2024-01-15T14:45:00Z
position:
  x: 250
  y: 150
links:
  - node-0987654321-xyz789ghi
task:
  status: in-progress
  priority: high
  assignee: john@example.com
  dueDate: 2024-01-20T17:00:00Z
tags:
  - important
  - review
---

# My Node Title

This is the content of the node...
```

## Key Features

### 1. Unified Data Storage
- All data stored as Markdown files in Git repository
- Metadata in YAML front matter
- Non-Markdown files can have `.metadata.md` companion files

### 2. Automatic Synchronization
- File system changes detected via `watchdog`
- WebSocket notifications to all connected clients
- Automatic UI refresh without manual reload

### 3. Version Control
- All changes committed to Git automatically
- Full history tracking for every node/task/file
- Rollback and diff capabilities

### 4. Relationship Management
- Hard links: Automatic based on directory structure
- Soft links: User-defined relationships stored in metadata
- Bidirectional navigation in graph view

### 5. Task Integration
- Tasks are nodes with `task` metadata
- Task-specific fields: status, priority, assignee, due date
- Same file can be viewed as node in graph or task in kanban

## Benefits

1. **Data Consistency**: Single source of truth for all content
2. **Version Control**: Full Git integration for all changes
3. **Flexibility**: Any node can become a task or vice versa
4. **Transparency**: All data stored as readable Markdown files
5. **Portability**: Can work offline with favorite editor
6. **Real-time Collaboration**: Changes sync across all users

## Future Enhancements

1. **Conflict Resolution**: Handle concurrent edits gracefully
2. **Performance Optimization**: Lazy loading for large projects
3. **Search Indexing**: Full-text search across all nodes
4. **Template System**: Pre-defined node templates
5. **Export Options**: Compile nodes to various formats 