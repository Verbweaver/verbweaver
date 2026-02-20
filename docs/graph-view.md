# Graph View User Guide

This guide covers the Graph view and its sub-views: Mind Map, Outline, Progression, and Group. It explains what each sub-view is for, how to use it, and tips for getting the most out of your data.

## Overview

The Graph view provides multiple ways to visualize and work with the nodes in your project:

- Mind Map: spatial, free-form view to explore relationships and organize nodes.
- Outline: structured, tree-based view mirroring folders and allowing virtual orderings.
- Progression: data-driven line charts built from node metadata to visualize trends across nodes over an X axis you define.
- Group: define named groups using Filters, visualize relationships between sets, and optionally nest groups.

A sub-view switcher is available within each sub-view for quick navigation (Mind Map → Group → Outline → Progression).

## Mind Map

The Mind Map shows nodes as draggable items connected by links:

- Drag nodes to rearrange; enable Rigid Mode to persist per-project folder positions.
- Soft links can be authored by node ID or by repository-relative path in a node's YAML frontmatter. The graph resolves any path-based links to the appropriate targets at load time.
- Use the left-side controls to hide uploads and toggle rigid layout.
- The MiniMap in the corner provides an overview for large graphs.

### Tips

- Save positions by enabling Rigid Mode.
- Use filters (from other panels) to reduce visual noise before switching here.

## Outline

The Outline lists nodes as a tree:

- Sort options let you preview and apply virtual ordering across folders.
- “Apply & Save” persists the virtual order per folder; “Clear” returns to natural order.
- “Hide uploads” toggles visibility of files in the uploads/ directory.

### Tips

- Combine Outline sorting with Mind Map positioning to create multiple organizational perspectives.

## Progression

The Progression view plots line charts from node metadata.

### Key Concepts

- X axis can be a string or number variable from node metadata. If numeric, positions reflect actual values; if string, values are spaced evenly, with an option to co-locate repeats.
- Y axis supports 1+ numeric variables, each rendered as a line with its own color and legend entry.
- Nodes included in the chart must have values for the selected X and all selected Y variables. Missing values are excluded automatically.

### Layout

- The chart is on the left; controls are on the right.
- The sub-view switcher is at the top of the controls panel.

### Filters and Scope

- Use the Filters button (shortcut to the same filters found in Node Selector) to narrow scope.
- Advanced → Select Files shows in-scope files; by default all are selected. Deselect files to exclude them.
- Advanced → Use manual ordering lets you manually order nodes along the X axis. When enabled, manual order takes precedence over numeric X.

### Variables

- X variable (string or number). Optionally co-locate repeated X values when using strings.
- Y variables are numeric only. Add multiple and pick a color per variable; colors are used for both the line and points.

### Labels and Titles

- Label axes with variable names.
- Show node titles at each point and/or horizontally along the X axis (staggered to reduce overlap; truncated with tooltip).

### Performance

- Max nodes defaults to 20. On web builds, the hard cap is 50 to protect performance.

### Export

- Save Image exports a PNG of the current chart. Choose a transparent or solid background. If solid, you can pick the color.
- Save/Load Config exports/imports the entire Progression configuration as JSON, including filters, selections, ordering, and display options.

## Group

The Group view lets you define up to 50 named groups (sets) using the existing Filters toolbox, and visualize how these sets relate.

Modes
- Default (Nest off): flat group boxes; draws edges for superset → subset relationships (Hasse diagram) between boxes; equivalent groups share one dotted-border box with combined labels.
- Nest groups (on): nested group boxes using React Flow sub-flows; duplicates a child group under each minimal parent; hides group-to-group edges (nesting conveys relationships).

Inside a group box
- Default: shows a count and a compact chip list of node titles; a side column lists a compact set of in-group soft-link arrows when space allows.
- Option “Show node cards”: renders full Mind Map node cards and in-group soft links.

Options
- Nest groups, Show node cards, Export/Import JSON, Clear layout, Auto layout.
- Max cards per group: limit the number of node cards rendered per group (useful for performance on large sets).

Persistence
- Group configuration, options, and layout are saved per tab in localStorage.

Context menus
- Right-click blank canvas: Save Map as PNG (uses native file save on desktop/Electron, or browser download on the web).
- Right-click node card: Mind Map actions (Edit, Delete, etc.).
- Right-click in-group edge: Unlink.

### Troubleshooting

- If a node doesn’t appear, check it has values for the selected X and all Y variables.
- If labels collide, toggle “Show node titles along X axis” off or trim variable lists.



