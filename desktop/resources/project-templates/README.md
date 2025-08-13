# {{ PROJECT_NAME }}

Welcome to your Verbweaver project.

## Getting Started

Verbweaver organizes ideas and tasks as Markdown files under the `nodes/` folder. Each node can be treated as a task; task fields (status, due date, etc.) live in the file's YAML frontmatter at the top.

### Project Structure

- `nodes/` — all content nodes and tasks (Markdown)
- `uploads/` — files you attach to nodes (original filenames preserved; referenced in Markdown)
- `templates/` — templates for new nodes and compiler exports
- `docs/` — optional documentation for your project
- `.verbweaver/` — project settings and internal data

### Views

- Graph: Mind Map and Outline subviews. Use Hide Uploads to filter `/uploads`, and Rigid Mode to prevent auto‑repositioning. You can lock nodes in place.
- Tasks: Board, Calendar, and To‑Do. The To‑Do view shows Overdue, Today, and Unscheduled lists with drag‑and‑drop between them. Mark tasks complete (moves to your configured Completed status).
- Editor: Markdown editor with shortcuts (Ctrl/Cmd+B/I/K, Ctrl/Cmd+P for preview) and Duplicate File.
- Version Control: Integrated Git status, branches, commits.
- Compiler: Export to PDF, DOCX, HTML, EPUB. Choose templates, include metadata and a table of contents.

Tips:
- Manage Statuses (columns) from Tasks or Project Settings.
- Set a Default Template for new nodes in Project Settings.
- Image links work with project‑relative paths, e.g. `![Alt](uploads/my-image.png)` or `![Alt](../uploads/my-image.png)`.

## Next Steps

1. Create your first node in `nodes/` (right‑click New in the Editor sidebar).
2. Open the Graph to visualize relationships and add links between nodes.
3. Plan work in Tasks → To‑Do or Board.
4. Export from Compiler when you’re ready to share.

## Version Control

This repository is a normal Git repo. Use the Version view to stage and commit changes, switch branches, and review history.


