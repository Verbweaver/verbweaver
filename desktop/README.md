---
id: node-1748520961585-9hmiz5x
title: README
type: file
position:
  x: 152.7670057796534
  'y': 30.03682611754199
modified: '2025-05-29T12:16:33.062Z'
---
# TestingNodes

This is a Verbweaver project for TestingNodes.

## Getting Started

This project uses Verbweaver to organize ideas, tasks, and content using a graph-based approach.
All content nodes (which can also be managed as tasks) are stored as Markdown files in the `nodes/` directory.
Task-specific information (like status, due date) is stored in the metadata (frontmatter) of these files.

### Project Structure

- `nodes/` - Contains all content nodes and task items (Markdown files).
- `docs/` - Project documentation.
- `templates/` - Reusable templates for content or graph appearance.
- `.verbweaver/` - Verbweaver configuration and metadata for this project.

### Views

- **Graph** - Visual representation of relationships between content in `nodes/`.
- **Editor** - Edit content and metadata of files in `nodes/`.
- **Threads** - Task management view that operates on items in `nodes/` based on their metadata.
- **Version Control** - Git integration for tracking changes.
- **Compiler** - Export content to various formats.

## Version Control

This project is backed by Git for version control. All changes are tracked and you can view the history in the Version Control view.
