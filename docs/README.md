# Verbweaver Documentation

Welcome to the Verbweaver documentation! This guide will help you understand, use, and contribute to Verbweaver.

## Table of Contents

1. [Getting Started](getting-started.md)
2. [Desktop Guide](desktop-guide.md)
3. [Desktop Quick Reference](desktop-quick-reference.md)
4. [Architecture](architecture.md)
5. [API Reference](api-reference.md)
6. [Install: Desktop](install-desktop.md)
7. [Install: Server](install-server.md)
8. [Deploy with Docker](docker-deploy.md)
9. [OAuth Setup](oauth-setup.md)
10. [Passkey (WebAuthn) Setup](passkey-setup.md)
11. [Compiler Template System](compiler-template-system.md)
12. [Dependency Checker](dependency-checker.md)
13. [Repository Paths](repository-paths.md)
14. [Security Checklist](security-checklist.md)
15. [Release Checklist](RELEASE_CHECKLIST.md)

## What is Verbweaver?

Verbweaver is a revolutionary writing and design platform that thinks in relationships (graphs). It's designed for:

- **Writers**: Organize your stories, characters, and worlds in interconnected nodes
- **Developers**: Track documentation, design docs, and technical specifications
- **Teams**: Collaborate on projects with full version control and task management
- **Anyone**: Who thinks in relationships and wants to organize their ideas

## Key Concepts

### Nodes
Every piece of content in Verbweaver is a node. A node can be:
- A markdown file with your content
- A task to track work
- A chapter, scene, or character in your story
- Documentation for your project
- Any file in your Git repository

### Edges (Links)
Nodes are connected by edges, which represent relationships:
- **Hard links**: Structural relationships (e.g., directory contains files)
- **Soft links**: Content relationships you define
- **Dependencies**: Task relationships
- **References**: Citations and cross-references

### Projects
Each project in Verbweaver is backed by a Git repository, giving you:
- Full version control
- Collaboration capabilities
- Offline access
- Integration with existing workflows

### Views
Verbweaver provides multiple views to work with your content:
- **Graph View**: Visualize relationships
- **Editor View**: Write and edit content
- **Tasks View**: Manage tasks
- **Version Control View**: Track changes
- **Compiler View**: Export your work

## Quick Start

1. **Install Verbweaver** (see [Getting Started](getting-started.md))
2. **Create a Project** backed by a Git repository
3. **Add Content** in the Editor view
4. **Link Ideas** in the Graph view
5. **Track Progress** with Tasks
6. **Export** your work with the Compiler

## Need Help?

- See [Desktop Guide](desktop-guide.md) for usage tips
- Read the [API Reference](api-reference.md) for technical details
- Join our community discussions
- Report issues on GitHub 