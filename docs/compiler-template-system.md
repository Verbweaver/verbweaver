# Compiler Template System

## Overview

Templates control how the [Compiler](compiler.md) lays out an exported document. A template is a Markdown file with placeholders, conditionals and loops written in a Pandoc-style syntax (`$title$`, `$if(...)$`, `$for(...)$`). Verbweaver fills these in itself, then hands the result to Pandoc to produce HTML, PDF, Word (DOCX), EPUB or ODT.

This guide is more technical than the others. You only need it to write your own templates; the templates that come with Verbweaver work without any of this.

## Requirements

The desktop app comes with Pandoc and Tectonic, the PDF engine, so exporting needs no extra software. If either is missing, see [Export Tools](dependency-checker.md).

## Architecture

### Template Storage
- Templates are stored in `templates/compiler/{format_type}/` within each project's Git repository
- When a new project is created, default templates are automatically copied from the global template set
- Templates are version-controlled via Git along with the project content

### Template Processing Flow
1. **Template Discovery**: The system scans for available templates based on the target format
2. **Template Validation**: Templates are validated for proper Pandoc syntax
3. **Content Aggregation**: Node content is collected and organized
4. **Template Processing**: Variables are substituted and loops are processed
5. **Pandoc Conversion**: The processed content is converted to the target format

## Writing Nodes for Templates (Practical Guide)

This section shows how to write Markdown nodes so templates can read your data reliably. You do not need to be a developer; just follow the patterns.

### Anatomy of a Node

Each node is a normal Markdown file with a YAML frontmatter block at the top.

```markdown
---
title: Wireless AP Replacement
type: node
description: Replace end‑of‑life APs in building C.
tags: [network, upgrade]
assignee: alice
dueDate: 2025-03-31
---

# $title

Write your content here. You can add headings, lists, and images.
```

Frontmatter is where templates read “variables” for each node. Field names are simple (letters, numbers, dash/underscore). Values can be strings, numbers, booleans, arrays, or objects.

### Making Node Data Available to Templates

Templates can read two buckets of per‑node values:
- `metadata` (your frontmatter)
- `vars` (resolved values from schema, overrides, and computes)

How the mapping works:
- If a template schema defines `nodeVariables.<name>.path`, the compiler looks up that dotted path inside your frontmatter and uses it as a default.
- If the schema also defines a `compute`, it will compute the value when the field is blank.
- You can override per‑node values from the Compiler’s “Per‑Node Variables” grid.

In templates you use:
- `$nodes.metadata.<key>$` to read raw frontmatter
- `$nodes.vars.<key>$` to read the resolved value (frontmatter → overrides → computed)

Tip: When a variable supports overrides or compute, prefer `$nodes.vars.<key>$` in templates.

### Example 1: CVSS for Findings (Security Reports)

Goal: Each finding node carries a CVSS vector; the template shows a numeric score and a severity label.

1) Add these fields in the node frontmatter (one node per finding):
```yaml
---
title: SQL Injection on /login
type: node
metadata_version: 1
cvss_vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
---
```

2) In the template frontmatter, declare:
```yaml
nodeVariables:
  cvssVector: { type: string, path: metadata.cvss_vector }
  cvss:       { type: number, compute: { fn: cvss.baseScore, args: ['${vars.cvssVector}'] } }
  severity:   { type: string, compute: { fn: cvss.severity, args: ['${vars.cvss}'] } }
```

3) Use in the template body:
```markdown
$for(nodes)$
### $nodes.title$

CVSS: $nodes.vars.cvss$ ($nodes.vars.severity$)

$nodes.content$
$endfor$
```

If you don’t have a vector in a node, you can fill it in the Compiler’s per‑node grid; the score and severity compute automatically.

### Example 2: Task Board / Project Work Items

Let’s store a few useful task fields and read them in a template.

Node frontmatter:
```yaml
---
title: Create Marketing Plan Q3
type: node
description: Draft plan with goals, channels, budget.
task:
  status: in-progress
  priority: high
  owner: bob
  estimateDays: 5
---
```

Template schema (read fields and compute helper values):
```yaml
nodeVariables:
  status:  { type: string, path: metadata.task.status }
  owner:   { type: string, path: metadata.task.owner }
  prio:    { type: string, path: metadata.task.priority }
  days:    { type: number, path: metadata.task.estimateDays }

variables:
  totalDays:
    type: number
    compute: { fn: sum, args: ['${nodes[*].vars.days}'] }
```

Template body snippet:
```markdown
### Work Items

| Title | Owner | Status | Priority | Estimate (days) |
|------|-------|--------|----------|-----------------|
$for(nodes)$
| $nodes.title$ | $nodes.vars.owner$ | $nodes.vars.status$ | $nodes.vars.prio$ | $nodes.vars.days$ |
$endfor$

**Total Estimated Days:** $totalDays$
```

### Example 3: RACI Matrix (Document‑Level Table)

Document frontmatter in the template declares the shape of the table; you fill rows in the Compiler UI (or default them in the template schema):
```yaml
variables:
  raci:
    type: array
    item:
      type: object
      fields:
        task: { type: string, label: Task, required: true }
        r: { type: string, label: Responsible }
        a: { type: string, label: Accountable }
        c: { type: string, label: Consulted }
        i: { type: string, label: Informed }
    default:
      - { task: Kickoff, r: Bob, a: Alice, c: Team, i: Execs }
```

Template body snippet:
```markdown
## RACI Matrix

| Task | R | A | C | I |
|------|---|---|---|---|
$for(raci)$
| $it.task$ | $it.r$ | $it.a$ | $it.c$ | $it.i$ |
$endfor$
```

Tip: In the Compiler you can import/export this table via CSV for quick editing.

### Example 4: Simple Flags and Enums

Node frontmatter:
```yaml
---
title: Internal Onboarding Guide
type: node
internal: true
audience: employee
---
```

Template schema:
```yaml
variables:
  isInternal: { type: boolean, compute: { fn: string.regexMatch, args: ['${title}', '(?i)internal'] } }
  audience:
    type: string
    enum: [employee, partner, public]
```

Template snippet:
```markdown
$if(isInternal)$
> This document is for internal use only.
$endif$

Target audience: $audience$
```

## Template Variables

### Document-Level Variables
- `$title$`: Document title
- `$author$`: Document author
- `$date$`: Today's date (YYYY-MM-DD)
- `$toc$`: A list of the selected pages and their `##` sections, when **Include table of contents** is ticked; empty otherwise

### Node-Level Variables
- `$nodes.title$`: Node title
- `$nodes.content$`: Node content (Markdown)
- `$nodes.metadata.<field>$`: One field from the page's details block, such as `$nodes.metadata.owner$`. To list every field, loop with `$for(nodes.metadata)$ $it.key$: $it.value$ $endfor$`.
- `$nodes.attachments$`: A bullet list of the page's attachments (name and size)

### Custom Variables
Custom variables are dynamically detected from the template and can be set by users through the UI.

### Schema-Driven Variables (Document and Node Scopes)

Templates can declare a schema in YAML frontmatter to describe expected variables for both document-level values and per-node values. The application uses this schema to render type-aware editors, CSV import/export, and to prefill values from node frontmatter.

Frontmatter keys:

```yaml
variables:
  avgCvss:
    type: number
    label: Average CVSS
    compute:
      fn: mean
      args: ['${nodes[*].vars.cvss}']
  raci:
    type: array
    item:
      type: object
      fields:
        task: { type: string, label: Task, required: true }
        r:    { type: string, label: Responsible }
        a:    { type: string, label: Accountable }
        c:    { type: string, label: Consulted }
        i:    { type: string, label: Informed }
    default:
      - { task: Kickoff, r: Bob, a: Alice, c: Team, i: Execs }

nodeVariables:
  cvssVector:
    type: string
    label: CVSS Vector
    path: metadata.cvss_vector   # prefill from node frontmatter if present
  cvss:
    type: number
    label: CVSS Score
    # compute is applied after merging frontmatter and per-node overrides
    compute:
      fn: cvss.baseScore
      args: ['${vars.cvssVector}']
  severity:
    type: string
    label: Severity
    compute:
      fn: cvss.severity
      args: ['${vars.cvss}']
```

Field options:
- `type`: string | number | boolean | array | table
- `label`: human-friendly label (optional)
- `description`: helper text (optional)
- `required`: boolean (document scope only for now)
- `min`, `max`: numeric bounds for number types
- `enum`: array of allowed values (renders as a select)
- `default`: default value for document variables
- `path`: for `nodeVariables`, dotted path into node frontmatter to prefill (e.g., `metadata.cvss`)
- `item`: when `type: array`, item schema (supports `type: object` with `fields`)
- `compute`: computed value (see below)

#### Table Variables (type: table)

Schema shape (document scope only):

```yaml
variables:
  myTable:
    type: table
    columnsDefault: ["Task", "Status"]              # optional; defaults to ["Task"]
    columnTypes:                           # optional per-column type defaults
      Task: { type: string }
      Status: { type: enum, enum: [todo, doing, done] }
```

Runtime value (what users edit in the Compiler UI):

```json
{
  "columns": ["Task", "Alice", "Bob"],
  "types": { "Task": { "type": "string" }, "Alice": { "type": "enum", "enum": ["", "R", "A", "C", "I"] } },
  "rows": [ { "Task": "Kickoff", "Alice": "R" } ]
}
```

Rendering options provided by the compiler:

- A) Full table as Markdown:
  - Nested: `$myTable.markdown$`
  - Top-level convenience: `$myTable_markdown$`

- B) Structured pieces for custom layouts:
  - Headers: `$for(myTable.columns)$ ... $endfor$` or `$for(myTable_columns)$ ... $endfor$`
  - Separator: `$myTable.headerSeparator$` or `$myTable_headerSeparator$`
  - Rows: `$for(myTable.rows)$ $it.line$ $endfor$` or `$for(myTable_rows)$ $it.line$ $endfor$`
  - Each row has `cells` (aligned to current columns) and a prebuilt `line` string.

UI behavior:
- Add/remove/rename/reorder columns, per-column type (string/number/boolean/enum), CSV import/export
- Web limits: ≤ 256 columns, ≤ 2000 characters per cell (blocked with validation message)
- Desktop: no limits

Example (RACI, Option A):
```markdown
## RACI Matrix

$raci_markdown$
```

Example (RACI, Option B):

```markdown
## RACI Matrix

| $for(raci_columns)$ $it$ |$endfor$
$raci_headerSeparator$
$for(raci_rows)$
$it.line$
$endfor$
```

## Computed Fields

Computed fields are derived values that the compiler calculates at compile time. They can be declared for both document-level variables and `nodeVariables`.

Syntax:

```yaml
compute:
  fn: <functionName>
  args: [<arg1>, <arg2>, ...]
```

Arguments support references via `${...}` selectors:
- Document scope values: `${title}`, `${author}`, etc.
- Node scope values: `${vars.cvssVector}`, `${metadata.foo}`.
- Aggregates over selected nodes: `${nodes[*].vars.cvss}`.

Supported functions (initial set):
- `cvss.baseScore(vector: string) -> number | null`
- `cvss.severity(scoreOrVector: number|string) -> string | null` (Critical/High/Medium/Low)
- `mean(array<number>) -> number | null`
- `sum(array<number>) -> number | null`
- `round(number, decimals=0) -> number | null`
- `string.upper(text) -> string`
- `string.lower(text) -> string`
 - `min(array<number>) -> number | null`
 - `max(array<number>) -> number | null`
 - `count(array<any>|any) -> number` (treats non-array as 0/1)
 - `string.regexMatch(text, pattern) -> boolean`
 - `date.now() -> string (ISO)`
 - `date.today() -> string (YYYY-MM-DD)`

Evaluation order:
1. Node-scoped values: merge `path` from frontmatter and compile-time overrides, then apply `compute` if value still missing. Results are exposed to templates under `$nodes.vars.*$`.
2. Document variables: after nodes are resolved, compute doc variables and merge into the template data.

Error handling:
- On errors or missing inputs, computed values become `null`. Use `$if(var)$...$endif$` guards in templates.

### Function Reference

Below are the supported compute functions with explanations and examples. In examples, `${...}` selectors reference values from the compile context.

#### cvss.baseScore(vector: string) -> number | null
- **Purpose**: Compute CVSS v3.x base score from a vector string (approximate implementation).
- **Args**:
  - `vector`: e.g., `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`
- **Returns**: Base score (0.0 to 10.0) or `null` if invalid.
- **Schema example**:
```yaml
nodeVariables:
  cvssVector: { type: string, path: metadata.cvss_vector }
  cvss:
    type: number
    compute: { fn: cvss.baseScore, args: ['${vars.cvssVector}'] }
```
- **Template usage**: `CVSS: $nodes.vars.cvss$`

#### cvss.severity(scoreOrVector: number|string) -> string | null
- **Purpose**: Compute qualitative severity from a score or vector.
- **Args**: number (score) or string (vector).
- **Returns**: `Critical` | `High` | `Medium` | `Low` or `null`.
- **Schema example**:
```yaml
nodeVariables:
  severity:
    type: string
    compute: { fn: cvss.severity, args: ['${vars.cvss}'] }
```
- **Template usage**: `$nodes.vars.severity$`

#### mean(array<number>) -> number | null
- **Purpose**: Average of numeric array.
- **Args**: Array of numbers (or strings parseable as numbers).
- **Returns**: Mean or `null` if empty.
- **Schema example (document scope)**:
```yaml
variables:
  avgCvss:
    type: number
    compute: { fn: mean, args: ['${nodes[*].vars.cvss}'] }
```
- **Template usage**: `Average: $avgCvss$`

#### sum(array<number>) -> number | null
- **Purpose**: Sum of numeric array.
- **Schema example**:
```yaml
variables:
  totalEffort:
    type: number
    compute: { fn: sum, args: ['${nodes[*].metadata.task.levelOfEffort}'] }
```

#### round(number, decimals=0) -> number | null
- **Purpose**: Round a number to a fixed number of decimals.
- **Schema example**:
```yaml
variables:
  avgCvssRounded:
    type: number
    compute: { fn: round, args: ['${avgCvss}', 1] }
```

#### min(array<number>) / max(array<number>) -> number | null
- **Purpose**: Minimum/maximum of a numeric array.
- **Schema example**:
```yaml
variables:
  maxCvss: { type: number, compute: { fn: max, args: ['${nodes[*].vars.cvss}'] } }
  minCvss: { type: number, compute: { fn: min, args: ['${nodes[*].vars.cvss}'] } }
```

#### count(array<any>|any) -> number
- **Purpose**: Count elements; if a non-array is passed, returns 1 if non-null else 0.
- **Schema example**:
```yaml
variables:
  findingCount: { type: number, compute: { fn: count, args: ['${nodes[*].title}'] } }
```

#### string.upper(text) / string.lower(text) -> string
- **Purpose**: Uppercase or lowercase transformation.
- **Schema example**:
```yaml
variables:
  authorUpper: { type: string, compute: { fn: string.upper, args: ['${author}'] } }
```

#### string.regexMatch(text, pattern) -> boolean
- **Purpose**: Test if text matches a regular expression.
- **Schema example**:
```yaml
variables:
  hasInternalTag: { type: boolean, compute: { fn: string.regexMatch, args: ['${title}', '(?i)internal'] } }
```
- **Template usage**:
```markdown
$if(hasInternalTag)$
> Note: This document is tagged as internal.
$endif$
```

#### date.now() -> string (ISO) / date.today() -> string (YYYY-MM-DD)
- **Purpose**: Timestamps for stamping exports.
- **Schema example**:
```yaml
variables:
  exportedAt: { type: string, compute: { fn: date.now } }
  exportDate: { type: string, compute: { fn: date.today } }
```

### Schema Validation Notes

Verbweaver performs a light validation on the schema declared in frontmatter:
- `variables` and `nodeVariables` must be objects when present.
- `type` must be one of: `string`, `number`, `boolean`, `array`, `table`.
- For `array` types:
  - `item` must be an object.
  - If `item.type: object`, then `item.fields` must be a non-empty object; each field must use a primitive `type` (string|number|boolean).
  - If `item.type` is a primitive, it must be string|number|boolean.
- `nodeVariables.path` (if provided) must be a dotted string path (e.g., `metadata.cvss`).
- `compute` must be an object with `fn` (string) and optional `args` (array). `fn` must be one of the functions in the [Function Reference](#function-reference).

Any problem found here is an error: the Compiler reports it and won't export with that template until it's fixed. Unbalanced `$` delimiters and broken `$for$`/`$if$` blocks are errors too.

## Using Node Variables in Templates

- Scalar: `$nodes.vars.cvss$`, `$nodes.vars.severity$`
- Conditional: `$if(nodes.vars)$ ... $endif$`
- Loop over pairs:
  ```markdown
  $for(nodes.vars)$
  - $it.key$: $it.value$
  $endfor$
  ```

## Compiler UI Behavior (Desktop/Web)

- Document variables:
  - Rendered per `variables` schema; supports number min/max, boolean, enum selects.
  - Arrays of objects (e.g., `raci`) include an inline grid with add/remove rows and CSV import/export.
  - Advanced mode: JSON input is accepted for ad-hoc arrays/objects.
- Per-node variables:
  - Rendered when `nodeVariables` exist in schema.
  - Prefilled from node frontmatter via `path`.
  - Users can override and import/export CSV; blanks fall back to frontmatter.

### Mapping Cheatsheet

- Read a frontmatter field directly in the template:
  - `$nodes.metadata.priority$`
- Expose a frontmatter field as a resolved variable with schema:
  - Schema: `nodeVariables.priority: { type: string, path: metadata.priority }`
  - Template: `$nodes.vars.priority$`
- Aggregate node values across the selection:
  - `${nodes[*].vars.days}` inside compute args
- Replace undefined values at compile time:
  - Use the per‑node grid or document variables in the Compiler.

### Tips & Best Practices

1) Keep field names stable and lowercase; avoid spaces.
2) Prefer `$nodes.vars.*$` in templates for values that may be overridden or computed.
3) Use `path` in schema to prefill from frontmatter so authors can write data once.
4) For large tables (RACI), use CSV import/export in the Compiler UI.
5) Guard optional sections with `$if(...)$` to avoid empty headings.

### Common Mistakes (and Fixes)

- “Template couldn’t parse my table rows”: ensure the array is an array of objects (see RACI example) or use the Compiler’s table editor.
- “Value didn’t show up”: check that you referenced `$nodes.vars.key$` (resolved) versus `$nodes.metadata.key$` (raw); also check spelling.
- “Dates render as text”: keep dates as ISO strings (YYYY-MM-DD) or add a compute to format.

## Template Syntax

### Basic Variable Substitution
```markdown
---
title: $title$
author: $author$
date: $date$
---

# $title$

By $author$ on $date$
```

### Loops
```markdown
$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.metadata.owner)$
**Owner:** $nodes.metadata.owner$
$endif$

$if(nodes.attachments)$
**Attachments:** $nodes.attachments$
$endif$

---
$endfor$
```

### Using Variables and Logic Inside Node Content

You can reference variables and other nodes directly inside a node’s Markdown body. The compiler evaluates node body content in multiple passes so references introduced by one node can be resolved in subsequent passes.

Scope rules:
- Selected nodes are rendered via `$for(nodes)$` and `$nodes.*$` during the first pass.
- Any node referenced by ID (e.g., `$node-<ID>...$`) is added to scope for later passes, but is not added to the `$nodes$` array.
- All passes have access to the same document variables and options you set in the Compiler.

Use the referenced page's `id` exactly as it appears in its details block. Pages created in Verbweaver get IDs like `node-1712345678901-abc1234`, so a reference looks like `$node-1712345678901-abc1234.content$`. References only work for IDs that start with `node-`.

Basics:
- Another node’s content: `$node-<ID>.content$`
- A variable of another node: `$node-<ID>.vars.character_name$`
- A frontmatter field: `$node-<ID>.metadata.priority$`
- Conditional on another node: `$if(node-<ID>.vars.ready)$…$endif$`
- Loop over another node’s attachments:
  ```markdown
  $if(node-<ID>.attachments)$
  ### Related Files
  $for(node-<ID>.attachments)$
  - $it.name$ ($it.size$)
  $endfor$
  $endif$
  ```

Chained references:
- If Node A embeds `$node-B.content$` and Node B embeds `$node-C.vars.foo$`, the compiler resolves them over multiple passes until no further changes occur or the pass limit is reached.

Pass limit and unresolved references:
- Default max passes: 5 (configurable in the Compiler’s Advanced section).
- Unresolved references render as empty by default.
- Optionally enable inline debug markers in the Compiler to emit comments like: `<!-- unresolved: node-abc123.vars.foo -->`.

Notes and limitations:
- Variables/logic are expanded only in node body content, not in YAML frontmatter.
- `$for(nodes)$` and `$nodes.*$` may be re-evaluated in later passes (toggle in Advanced settings).
- `{% include_relative %}` is only for templates; includes inside node bodies are not processed.

### Conditionals
```markdown
$if(title)$
# $title$
$endif$

$if(draft)$
**Draft:** not for distribution.
$else$
Final version.
$endif$

$ifnot(nodes.metadata.verified)$
(unverified)
$endif$
```

`$if(x)$` is true when `x` is set and not empty, false or an empty list. `$ifnot(x)$` is the opposite. Both can have an `$else$` part.

### Separators in loops

Text after `$sep$` goes between items but not after the last one:

```markdown
Tags: $for(tags)$$it$$sep$, $endfor$
```

gives `Tags: red, green, blue`.

### Line breaks around tags

As in Pandoc templates, a line that holds only a tag (`$if(...)$`, `$else$`, `$endif$`, `$for(...)$`, `$endfor$`) disappears completely, including its line break. That lets a loop build the rows of a Markdown table:

```markdown
| Name | Role |
|------|------|
$for(stakeholders)$
| $it.name$ | $it.role$ |
$endfor$
```

Because those lines vanish, leave a blank line before a list that a loop produces, or Markdown joins the list to the paragraph above it.

### Nesting

An `$if$` block can't yet contain another `$if$` block, and a `$for$` loop can't contain another loop, except that `$for(nodes)$` may contain loops such as `$for(nodes.metadata)$`. For example, `$if(a)$ ... $if(b)$ ... $endif$ ... $endif$` ends the outer block at the first `$endif$`. Use separate blocks instead. This is tracked as a bug (see issue #135).

### Including other templates

A template can include another template file, relative to its own folder:

```markdown
{% include_relative ../markdown/simple.md %}
```

The templates that come with Verbweaver use this: each format's template includes the Markdown version, so a change to `markdown/simple.md` applies to every format. If the file isn't found, the output contains `<!-- ERROR: Included template not found: ... -->`.

### Text that looks like a variable

In page text, `$...$` that isn't a variable the template uses, a node reference or a dotted path is left alone, so TeX maths such as `$x^2$` and prices such as `$5-$10` come through unchanged. In the template itself, every `$` must be part of a placeholder (`$name$`); a single `$` makes the template invalid.

## Supported Formats

### HTML
- **Engine**: Pandoc with `--standalone --self-contained`
- **Features**: Full HTML document with embedded CSS
- **Use Case**: Web publishing, documentation

### PDF
- **Engine**: Pandoc with Tectonic as the PDF engine, or xelatex if Tectonic isn't available
- **Features**: Professional PDF output with proper typography
- **Use Case**: Print-ready documents, academic papers

### DOCX
- **Engine**: Pandoc with basic DOCX export
- **Features**: Microsoft Word compatible format
- **Use Case**: Business documents, collaborative editing

### EPUB
- **Engine**: Pandoc with EPUB generation
- **Features**: E-book format with metadata
- **Use Case**: E-book publishing, digital reading

### ODT
- **Engine**: Pandoc with OpenDocument Text format
- **Features**: Open-source document format
- **Use Case**: LibreOffice compatibility

## Default Templates

Every new project gets three templates for each format, in `templates/compiler/<format>/`. The Markdown files hold the layout; the other formats include them with `{% include_relative ../markdown/<name>.md %}`. Open them in the Editor to see the full text or to use them as a starting point.

### Simple (`simple.md`)

The title, then each selected page as a `##` section with its text. If the template defines node variables, each page also gets a "Variables" list. This is the default when no template is chosen and the project has no default set.

### Academic (`academic.md`)

Like Simple, plus an **includeMetadata** variable (a checkbox in the Compiler). When ticked, each page's details are listed under a "Metadata" heading. Attachments are listed by name and size.

### Technical Report (`technical-report.md`)

For reports with a fixed structure. Document variables:

- **summary**: an "Executive Summary" paragraph.
- **changelog** and **stakeholders**: lists edited as grids in the Compiler (or imported from CSV), shown as tables.
- **raci**: a table variable, shown with `$raci_markdown$`.

Each page is a section, except pages whose **appendix** node variable is true (from `appendix: true` in their details block), which are meant to appear under "Appendices". Node variables **cvss_vector** and **cvss** are read from the page details for security findings.

Known issue: because of the nesting limitation above, the "Appendices" section currently repeats every page (see issue #135).

## Error Handling

### Pandoc Not Installed
If Pandoc can't be found, the Compiler says so. See [Export Tools](dependency-checker.md).

### Template Validation Errors
Invalid templates will be flagged with specific error messages:
- Unbalanced delimiters
- Invalid loop syntax
- Missing required variables

### Conversion Failures
Format-specific conversion errors are handled gracefully:
- PDF: LaTeX engine issues
- DOCX: Template reference problems
- EPUB: Metadata validation errors



## Best Practices

### Template Design
1. **Keep templates simple**: Start with basic formatting and add complexity gradually
2. **Use meaningful variable names**: Make custom variables self-documenting
3. **Test across formats**: Ensure templates work with all target formats
4. **Version control**: Track template changes in Git

### Content Organization
1. **Consistent metadata**: Use consistent front matter across nodes
2. **Clear structure**: Organize content with clear headings and sections
3. **Attachment management**: Keep attachments organized and referenced properly

## Troubleshooting

### Common Issues

**Pandoc or the PDF engine not found:**
- Open **Settings → Dependencies** and follow [Export Tools](dependency-checker.md).

**Template validation errors:**
- Check for balanced `$` delimiters
- Verify loop syntax: `$for(var)$...$endfor$`
- Ensure conditional syntax: `$if(var)$...$endif$`

**Custom variables not detected:**
- Variables must be in `$variable$` format
- Exclude Pandoc control variables from custom variables
