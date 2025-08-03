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