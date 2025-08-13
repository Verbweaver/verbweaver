# Template System Documentation

## Overview

The Verbweaver template system allows users to customize how their exported documents appear. Templates are Markdown files that use Pandoc's template syntax for variable substitution, conditionals, and loops. The system supports multiple output formats including HTML, PDF, DOCX, EPUB, and ODT.

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

## Template Variables

### Document-Level Variables
- `$title$`: Document title
- `$author$`: Document author
- `$date$`: Document date
- `$toc$`: Table of contents (if enabled)

### Node-Level Variables
- `$nodes.title$`: Node title
- `$nodes.content$`: Node content (Markdown)
- `$nodes.metadata$`: Node metadata (YAML front matter)
- `$nodes.attachments$`: Node attachments

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
- `type`: string | number | boolean | array
- `label`: human-friendly label (optional)
- `description`: helper text (optional)
- `required`: boolean (document scope only for now)
- `min`, `max`: numeric bounds for number types
- `enum`: array of allowed values (renders as a select)
- `default`: default value for document variables
- `path`: for `nodeVariables`, dotted path into node frontmatter to prefill (e.g., `metadata.cvss`)
- `item`: when `type: array`, item schema (supports `type: object` with `fields`)
- `compute`: computed value (see below)

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
- **Returns**: Base score (0.0 – 10.0) or `null` if invalid.
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
- `type` must be one of: `string`, `number`, `boolean`, `array`.
- For `array` types:
  - `item` must be an object.
  - If `item.type: object`, then `item.fields` must be a non-empty object; each field must use a primitive `type` (string|number|boolean).
  - If `item.type` is a primitive, it must be string|number|boolean.
- `nodeVariables.path` (if provided) must be a dotted string path (e.g., `metadata.cvss`).
- `compute` must be an object with `fn` (string) and optional `args` (array). Unknown function names are warned but not fatal.

Validation warnings appear in the template validation response and are non-fatal; invalid Pandoc syntax remains a hard error.

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

## Example: Technical Report RACI + CVSS

Frontmatter:

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

nodeVariables:
  cvssVector: { type: string, label: CVSS Vector, path: metadata.cvss_vector }
  cvss:       { type: number, label: CVSS, compute: { fn: cvss.baseScore, args: ['${vars.cvssVector}'] } }
  severity:   { type: string, label: Severity, compute: { fn: cvss.severity, args: ['${vars.cvss}'] } }
```

Template:

```markdown
## RACI Matrix

| Task | R | A | C | I |
|------|---|---|---|---|
$for(raci)$
| $it.task$ | $it.r$ | $it.a$ | $it.c$ | $it.i$ |
$endfor$

$for(nodes)$
### $nodes.title$

CVSS: $nodes.vars.cvss$ ($nodes.vars.severity$)

$nodes.content$
$endfor$
```

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

$if(nodes.metadata)$
**Metadata:** $nodes.metadata$
$endif$

$if(nodes.attachments)$
**Attachments:** $nodes.attachments$
$endif$

---
$endfor$
```

### Conditionals
```markdown
$if(title)$
# $title$
$endif$

$if(author)$
By $author$
$endif$
```

## Supported Formats

### HTML
- **Engine**: Pandoc with `--standalone --self-contained`
- **Features**: Full HTML document with embedded CSS
- **Use Case**: Web publishing, documentation

### PDF
- **Engine**: Pandoc with `--pdf-engine=xelatex` (fallback to `pdflatex`)
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

### Simple Template
A basic template with minimal formatting:
```markdown
---
title: $title$
author: $author$
date: $date$
---

# $title$

By $author$ on $date$

$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.metadata)$
**Metadata:** $nodes.metadata$
$endif$

$if(nodes.attachments)$
**Attachments:** $nodes.attachments$
$endif$

---
$endfor$
```

### Academic Template
A more structured template suitable for academic documents:
```markdown
---
title: $title$
author: $author$
date: $date$
documentclass: article
geometry: margin=1in
---

\maketitle

\tableofcontents

$for(nodes)$
\section{$nodes.title$}

$nodes.content$

$if(nodes.metadata)$
\textbf{Metadata:} $nodes.metadata$
$endif$

$if(nodes.attachments)$
\textbf{Attachments:} $nodes.attachments$
$endif$

$endfor$

\section{References}

[References would be automatically generated here]
```

## API Endpoints

### Get Available Templates
```
GET /api/v1/projects/{project_id}/compiler/templates?format={format}
```
Returns a list of available templates for the specified format.

### Get Template Content
```
GET /api/v1/projects/{project_id}/compiler/templates/{template_path}
```
Returns the template content, validation status, and detected custom variables.

### Compile Document
```
POST /api/v1/projects/{project_id}/compiler/compile
```
Compiles a document using the specified template and custom variables.

## Error Handling

### Pandoc Not Installed
If Pandoc is not available, the system will return an error message with installation instructions:
```
Pandoc is not installed. Please install Pandoc to use this feature.
Visit: https://pandoc.org/installing.html
```

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

## Installation Requirements

### Pandoc
Pandoc is required for document conversion. Installation methods:

**Windows:**
```powershell
winget install pandoc
```

**macOS:**
```bash
brew install pandoc
```

**Linux:**
```bash
sudo apt-get install pandoc
```

### LaTeX (for PDF)
For PDF generation, a LaTeX distribution is required:

**Windows:** Install MiKTeX or TeX Live
**macOS:** Install MacTeX
**Linux:** Install TeX Live

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

### Performance Considerations
1. **Template caching**: Templates are cached for performance
2. **Content validation**: Large documents are validated before processing
3. **Error recovery**: Failed conversions are handled gracefully

## Troubleshooting

### Common Issues

**Pandoc not found:**
- Ensure Pandoc is installed and in PATH
- Check installation with `pandoc --version`

**PDF generation fails:**
- Install LaTeX distribution (MiKTeX, TeX Live, MacTeX)
- Check LaTeX installation with `xelatex --version`

**Template validation errors:**
- Check for balanced `$` delimiters
- Verify loop syntax: `$for(var)$...$endfor$`
- Ensure conditional syntax: `$if(var)$...$endif$`

**Custom variables not detected:**
- Variables must be in `$variable$` format
- Exclude Pandoc control variables from custom variables

### Debug Mode
Enable debug logging to troubleshoot template processing:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Future Enhancements

### Planned Features
- **Template editor**: Visual template editing interface
- **Live preview**: Real-time template preview
- **Template sharing**: Community template repository
- **Advanced formatting**: CSS styling for HTML output
- **Bibliography support**: Automatic citation management

### Format Extensions
- **MOBI**: Kindle format support (requires Calibre)
- **LaTeX**: Direct LaTeX output
- **AsciiDoc**: AsciiDoc format support
- **ReStructuredText**: RST format support

## Implementation Status

✅ **Phase 1 Complete**: Template system architecture and basic functionality
✅ **Phase 2 Complete**: Pandoc integration and multi-format export
🔄 **Phase 3 Planned**: Advanced features and UI enhancements

The template system is fully functional and ready for production use. All core features have been implemented and tested across multiple output formats. 