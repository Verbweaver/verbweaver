# Editor User Guide

Welcome to the Verbweaver Editor. The Editor lets you write and organize content using Markdown with YAML front matter, link nodes together, attach files, and preview formatted output.

## Markdown flavor

Verbweaver uses Pandoc's Markdown. It supports standard Markdown plus advanced features. See the Pandoc manual for full reference: https://pandoc.org/MANUAL.html#pandocs-markdown

### Headings

```
# Title
## Section
### Subsection
```

### Emphasis

```
*italic*  **bold**  ~~strikethrough~~
```

### Lists

```
- Item 1
- Item 2
  - Nested
```

### Tables (advanced)

```
| Column A | Column B |
|----------|----------|
| A1       | B1       |
| A2       | B2       |
```

### Code

Inline: `const x = 1`

Block:

```js
function greet(name) {
  console.log(`Hello, ${name}`)
}
```

## Links between nodes

Verbweaver supports several types of links for connecting nodes:

### Relative links (recommended)

Navigate to files relative to the current file's location:

```markdown
[Previous chapter](../chapter-1.md)
[Character notes](./characters/protagonist.md)
[Plot outline](../../planning/outline.md)
```

### Absolute repo-relative links

Navigate from the project root using absolute paths:

```markdown
[Main character](/nodes/characters/hero.md)
[World map](/uploads/assets/world-map.png)
[Project notes](/nodes/planning/overview.md)
```

### Anchors (jump to headings)

Link to specific sections within files using heading anchors:

```markdown
[Story climax](chapter-10.md#the-final-battle)
[Character backstory](characters/villain.md#origins)
[Jump to overview](#overview)
```

Headings automatically become anchors using lowercase, hyphenated versions:
- `# The Final Battle` becomes `#the-final-battle`
- `## Character Origins` becomes `#character-origins`

### Complete examples

```markdown
See the [villain's motivation](../characters/antagonist.md#motivation) 
for context on this [plot twist](./chapter-15.md#revelation).

For background, check the [world building notes](nodes/worldbuilding/magic-system.md).
```

In the Editor, Ctrl/Cmd+Click a Markdown link to open the linked node. In Preview, click links as usual. If you have unsaved changes, you'll be prompted before navigating.

## Embedding images

Store images in your repository and link them relative to the current file, for example:

```
![Diagram of flow](../images/flow.png)
```

Absolute repo-relative also works:

```
![Logo](/uploads/assets/logo.png)
```

Images that aren't Markdown files should exist in the repo (e.g., `uploads/`), with optional `.metadata.md` for graph visibility.

## YAML front matter

Each Markdown node can start with YAML front matter between `---` lines. This stores metadata used by Verbweaver:

```
---
id: node-123
title: Chapter 1
links: [node-abc, node-def]
task:
  tracked: true
---
```

- `title`: Display name in graph and lists.
- `links`: Soft links to other nodes by ID (Editor shows them in the Links panel).
- `task.tracked`: Whether this node appears as a Task in Threads.

## Preview

Click the Preview button to render the current Markdown using the server-side previewer (Pandoc). The preview hides YAML metadata if you enable "Hide Metadata".

## Useful tips

- Ctrl/Cmd+S saves the file.
- Ctrl/Cmd+Click relative links to navigate.
- Use the paperclip icon to attach files to the node (stored in `uploads/`).
- Use the Task toggle to include/exclude the node from Threads.

## Learn more

See the full Pandoc Markdown manual: https://pandoc.org/MANUAL.html#pandocs-markdown
