"""
Template service for compiler export functionality
"""

import os
import re
import yaml
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import subprocess
import tempfile
import logging

logger = logging.getLogger(__name__)

class TemplateService:
    """Service for managing and processing export templates"""
    
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.templates_dir = Path(project_path) / "templates" / "compiler"
        self.supported_formats = ['markdown', 'html', 'pdf', 'docx', 'epub']
    
    def get_available_templates(self, format_type: str) -> List[Dict[str, str]]:
        """Get available templates for a specific format"""
        if format_type not in self.supported_formats:
            return []
        
        format_dir = self.templates_dir / format_type
        if not format_dir.exists():
            return []
        
        templates = []
        for template_file in format_dir.glob("*.md"):
            if template_file.is_file():
                templates.append({
                    'name': template_file.stem,
                    'path': str(template_file.relative_to(self.project_path)),
                    'format': format_type
                })
        
        return templates
    
    def get_template_content(self, template_path: str) -> Optional[str]:
        """Get the content of a template file"""
        full_path = Path(self.project_path) / template_path
        if not full_path.exists():
            return None
        
        try:
            return full_path.read_text(encoding='utf-8')
        except Exception as e:
            logger.error(f"Failed to read template {template_path}: {e}")
            return None
    
    def validate_template(self, template_content: str) -> Tuple[bool, List[str]]:
        """Validate template syntax and extract custom variables"""
        errors = []
        custom_variables = []
        
        try:
            # Check for basic Pandoc template syntax
            if not re.search(r'\$[a-zA-Z_][a-zA-Z0-9_]*\$', template_content):
                errors.append("Template must contain at least one variable")
            
            # Extract custom variables (excluding standard ones and control variables)
            standard_vars = {'title', 'author', 'date', 'toc', 'nodes', 'nodes.title', 
                           'nodes.content', 'nodes.metadata', 'nodes.attachments'}
            control_vars = {'if', 'endif', 'for', 'endfor', 'it', 'it.key', 'it.value', 
                           'it.name', 'it.size'}
            
            variables = re.findall(r'\$([a-zA-Z_][a-zA-Z0-9_.]*)\$', template_content)
            for var in variables:
                if (var not in standard_vars and var not in control_vars and 
                    var not in custom_variables):
                    custom_variables.append(var)
            
            # Check for balanced delimiters
            if template_content.count('$') % 2 != 0:
                errors.append("Unbalanced variable delimiters")
            
            # Check for basic loop syntax
            if '$for(' in template_content and '$endfor$' not in template_content:
                errors.append("Unclosed for loop")
            
            if '$if(' in template_content and '$endif$' not in template_content:
                errors.append("Unclosed if statement")
                
        except Exception as e:
            errors.append(f"Template validation error: {e}")
        
        return len(errors) == 0, custom_variables
    
    def process_template(self, template_content: str, data: Dict[str, Any]) -> str:
        """Process template with provided data.
        Supports a subset of Pandoc-like template syntax inside Markdown content:
        - $var$
        - $if(var)$ ... $endif$
        - $for(nodes)$ ... $endfor$
        - $if(nodes.metadata)$, $for(nodes.metadata)$ and the $it.key$/$it.value$ placeholders
        - $if(nodes.attachments)$, $for(nodes.attachments)$ and $it.name$/$it.size$
        """
        processed_content = template_content

        # Replace simple variables first
        for key, value in data.items():
            if isinstance(value, (str, bool, int, float)):
                processed_content = processed_content.replace(f'${key}$', str(value))

        # Top-level conditionals like $if(toc)$ ... $endif$
        def replace_top_level_if(var_name: str, text: str) -> str:
            pattern = re.compile(rf"\$if\({re.escape(var_name)}\)\$(.*?)\$endif\$", re.DOTALL)
            truthy = bool(data.get(var_name))
            def repl(match):
                return match.group(1) if truthy else ''
            return pattern.sub(repl, text)

        for cond in ['toc', 'includeMetadata', 'include_metadata']:
            processed_content = replace_top_level_if(cond, processed_content)

        # Generate a basic Table of Contents if requested and placeholder is present
        if data.get('toc') and '$toc$' in processed_content:
            toc_md = self._generate_basic_toc(data.get('nodes', []))
            processed_content = processed_content.replace('$toc$', toc_md)

        # Handle nodes array and node-scoped controls
        if 'nodes' in data:
            processed_content = self._process_nodes_array(processed_content, data['nodes'])

        return processed_content
    
    def _process_nodes_array(self, template: str, nodes: List[Dict[str, Any]]) -> str:
        """Process the nodes array in the template."""
        for_match = re.search(r'\$for\(nodes\)\$(.*?)\$endfor\$', template, re.DOTALL)
        if not for_match:
            return template

        loop_content = for_match.group(1)
        rendered_nodes: List[str] = []

        for node in nodes:
            node_block = loop_content

            # Replace scalar node fields, e.g., $nodes.title$, $nodes.content$
            for key, value in node.items():
                if isinstance(value, str):
                    node_block = node_block.replace(f'$nodes.{key}$', value)
                elif isinstance(value, (int, float)):
                    node_block = node_block.replace(f'$nodes.{key}$', str(value))
                elif isinstance(value, dict):
                    # Replace $nodes.metadata.foo$
                    for meta_key, meta_value in value.items():
                        node_block = node_block.replace(f'$nodes.{key}.{meta_key}$', str(meta_value))

            # Node-scoped conditionals
            def eval_node_if(var_expr: str, present: bool, text: str) -> str:
                pattern = re.compile(rf"\$if\({re.escape(var_expr)}\)\$(.*?)\$endif\$", re.DOTALL)
                return pattern.sub(lambda m: m.group(1) if present else '', text)

            has_meta = isinstance(node.get('metadata'), dict) and len(node.get('metadata')) > 0
            node_block = eval_node_if('nodes.metadata', has_meta, node_block)

            has_atts = isinstance(node.get('attachments'), list) and len(node.get('attachments')) > 0
            node_block = eval_node_if('nodes.attachments', has_atts, node_block)

            # Expand metadata loop $for(nodes.metadata)$ ... $endfor$
            meta_loop = re.search(r'\$for\(nodes\.metadata\)\$(.*?)\$endfor\$', node_block, re.DOTALL)
            if meta_loop:
                inner = meta_loop.group(1)
                items: List[str] = []
                if has_meta:
                    for mk, mv in node['metadata'].items():
                        item = inner
                        item = item.replace('$it.key$', str(mk))
                        item = item.replace('$it.value$', str(mv))
                        items.append(item)
                node_block = node_block.replace(meta_loop.group(0), '\n'.join(items))

            # Expand attachments loop $for(nodes.attachments)$ ... $endfor$
            att_loop = re.search(r'\$for\(nodes\.attachments\)\$(.*?)\$endfor\$', node_block, re.DOTALL)
            if att_loop:
                inner = att_loop.group(1)
                items = []
                if has_atts:
                    for att in node['attachments']:
                        if isinstance(att, dict):
                            item = inner
                            for k, v in att.items():
                                item = item.replace(f'$it.{k}$', str(v))
                            items.append(item)
                node_block = node_block.replace(att_loop.group(0), '\n'.join(items))

            # Basic $nodes.attachments$ single placeholder support
            if '$nodes.attachments$' in node_block and has_atts:
                bullet_lines = []
                for att in node['attachments']:
                    if isinstance(att, dict):
                        name = att.get('name', 'Unknown')
                        size = att.get('size', '')
                        bullet = f"- {name} ({size})" if size else f"- {name}"
                        bullet_lines.append(bullet)
                node_block = node_block.replace('$nodes.attachments$', '\n'.join(bullet_lines))

            rendered_nodes.append(node_block)

        return template.replace(for_match.group(0), '\n\n'.join(rendered_nodes))

    def _generate_basic_toc(self, nodes: List[Dict[str, Any]]) -> str:
        """Generate a simple Markdown Table of Contents based on node titles and headings.
        This is a lightweight fallback so `$toc$` doesn't leak into output.
        """
        lines: List[str] = []
        for node in nodes:
            title = node.get('title')
            if title:
                lines.append(f"- {title}")
                # Parse H2-level headings from node content for nested entries
                content = node.get('content', '') or ''
                for line in content.split('\n'):
                    if line.startswith('## '):
                        lines.append(f"  - {line[3:].strip()}")
        return '\n'.join(lines) if lines else ''
    
    def convert_with_pandoc(self, markdown_content: str, output_format: str, 
                           output_file: str, working_dir: str = None, options: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
        """Convert markdown content to target format using Pandoc"""
        try:
            # Check if Pandoc is available
            result = subprocess.run(['pandoc', '--version'], 
                                  capture_output=True, text=True)
            if result.returncode != 0:
                return False, "Pandoc is not installed. Please install Pandoc to use this feature."
            
            # Create temporary markdown file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.md', 
                                           delete=False, encoding='utf-8') as temp_file:
                temp_file.write(markdown_content)
                temp_file_path = temp_file.name
            
            try:
                # Build pandoc command
                cmd = ['pandoc', temp_file_path, '-o', output_file]
                # Ensure resources (images) resolve relative to project root
                try:
                    if os.path.isdir(self.project_path):
                        cmd.extend(['--resource-path', self.project_path])
                except Exception:
                    pass

                # Enable table of contents when requested
                if options and (options.get('includeTOC') or options.get('includeToc')):
                    cmd.append('--toc')
                
                # Add format-specific options
                if output_format == 'pdf':
                    # Use xelatex for better Unicode support, fallback to pdflatex
                    cmd.extend(['--pdf-engine=xelatex'])
                elif output_format == 'html':
                    cmd.extend(['--standalone', '--self-contained'])
                elif output_format == 'docx':
                    # Basic DOCX export without reference template
                    pass
                elif output_format == 'epub':
                    # Basic EPUB export without metadata file
                    pass
                elif output_format == 'odt':
                    # OpenDocument Text format
                    pass
                elif output_format == 'mobi':
                    # Kindle format (requires calibre)
                    return False, "MOBI format requires Calibre. Please install Calibre to use this feature."
                
                # Run pandoc with working directory if provided
                if working_dir:
                    result = subprocess.run(cmd, capture_output=True, text=True, cwd=working_dir)
                else:
                    result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode != 0:
                    error_msg = result.stderr.strip()
                    if "xelatex" in error_msg and output_format == 'pdf':
                        # Try with pdflatex as fallback
                        cmd = ['pandoc', temp_file_path, '-o', output_file, '--pdf-engine=pdflatex']
                        if working_dir:
                            result = subprocess.run(cmd, capture_output=True, text=True, cwd=working_dir)
                        else:
                            result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode != 0:
                            return False, f"Pandoc PDF conversion failed: {result.stderr}"
                    else:
                        return False, f"Pandoc conversion failed: {error_msg}"
                
                return True, "Conversion successful"
                
            finally:
                # Clean up temporary file
                os.unlink(temp_file_path)
                
        except FileNotFoundError:
            return False, "Pandoc is not installed. Please install Pandoc to use this feature."
        except Exception as e:
            return False, f"Pandoc conversion error: {str(e)}"
    
    def create_default_templates(self) -> None:
        """Create default templates for all supported formats"""
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        
        # Create templates for each format
        for format_type in self.supported_formats:
            format_dir = self.templates_dir / format_type
            format_dir.mkdir(exist_ok=True)
            
            # Create simple template
            simple_template = self._get_simple_template(format_type)
            simple_path = format_dir / "simple.md"
            simple_path.write_text(simple_template, encoding='utf-8')
            
            # Create academic template
            academic_template = self._get_academic_template(format_type)
            academic_path = format_dir / "academic.md"
            academic_path.write_text(academic_template, encoding='utf-8')

            # Create technical-report template
            technical_template = self._get_technical_report_template(format_type)
            technical_path = format_dir / "technical-report.md"
            technical_path.write_text(technical_template, encoding='utf-8')
    
    def _get_simple_template(self, format_type: str) -> str:
        """Get simple template for a format"""
        if format_type == 'html':
            return """<!DOCTYPE html>
<html>
<head>
    <title>$title$</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #333; border-bottom: 2px solid #333; }
        h2 { color: #666; margin-top: 30px; }
        .metadata { color: #888; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>$title$</h1>
    <div class="metadata">
        <p><strong>Author:</strong> $author$</p>
        <p><strong>Date:</strong> $date$</p>
    </div>
    
    $for(nodes)$
    <h2>$nodes.title$</h2>
    $nodes.content$
    $endfor$
</body>
</html>"""
        else:
            return """---
title: $title$
author: $author$
date: $date$
---

# $title$

$for(nodes)$
## $nodes.title$

$nodes.content$

$endfor$"""
    
    def _get_academic_template(self, format_type: str) -> str:
        """Get academic template for a format"""
        if format_type == 'html':
            return """<!DOCTYPE html>
<html>
<head>
    <title>$title$</title>
    <style>
        body { font-family: 'Times New Roman', serif; margin: 40px; line-height: 1.6; }
        h1 { text-align: center; color: #333; }
        h2 { color: #666; margin-top: 30px; }
        .abstract { font-style: italic; margin: 20px 0; padding: 10px; background: #f9f9f9; }
        .toc { margin: 20px 0; }
        .toc ul { list-style-type: none; }
        .toc li { margin: 5px 0; }
        .metadata { text-align: center; color: #888; margin-bottom: 30px; }
    </style>
</head>
<body>
    <h1>$title$</h1>
    <div class="metadata">
        <p><strong>Author:</strong> $author$</p>
        <p><strong>Date:</strong> $date$</p>
    </div>
    
    $if(toc)$
    <div class="toc">
        <h2>Table of Contents</h2>
        $toc$
    </div>
    $endif$
    
    $for(nodes)$
    <h2>$nodes.title$</h2>
    $nodes.content$
    
    $if(nodes.metadata)$
    <div class="metadata">
        <h3>Metadata</h3>
        $for(nodes.metadata)$
        <p><strong>$it.key$:</strong> $it.value$</p>
        $endfor$
    </div>
    $endif$
    
    $if(nodes.attachments)$
    <div class="attachments">
        <h3>Attachments</h3>
        $for(nodes.attachments)$
        <p>- $it.name$ ($it.size$)</p>
        $endfor$
    </div>
    $endif$
    
    $endfor$
</body>
</html>"""
        else:
            return """---
title: $title$
author: $author$
date: $date$
---

# $title$

$if(toc)$
## Table of Contents
$toc$
$endif$

$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.metadata)$
### Metadata
$for(nodes.metadata)$
- **$it.key$:** $it.value$
$endfor$
$endif$

$if(nodes.attachments)$
### Attachments
$for(nodes.attachments)$
- $it.name$ ($it.size$)
$endfor$
$endif$

$endfor$""" 

    def _get_technical_report_template(self, format_type: str) -> str:
        """Technical report template with executive summary, changelog, stakeholders, RACI, appendices."""
        if format_type == 'html':
            return """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>$title$</title>
  <style>
    body { font-family: Georgia, serif; margin: 40px; line-height: 1.6; }
    h1, h2 { border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; }
    .small { font-size: 0.9em; color: #555; }
  </style>
  $if(toc)$<div><strong>Table of Contents</strong>$toc$</div>$endif$
  <h1>$title$</h1>
  <div class="small">Author: $author$ • Date: $date$</div>
</head>
<body>

<h2>Executive Summary</h2>
<p>$summary$</p>

<h2>Document Changelog</h2>
<table>
  <thead><tr><th>Date</th><th>Version</th><th>Author</th><th>Change</th></tr></thead>
  <tbody>
    $for(changelog)$
    <tr><td>$it.date$</td><td>$it.version$</td><td>$it.author$</td><td>$it.note$</td></tr>
    $endfor$
  </tbody>
  </table>

<h2>Stakeholder Registry</h2>
<table>
  <thead><tr><th>Name</th><th>Role</th><th>Contact</th></tr></thead>
  <tbody>
    $for(stakeholders)$
    <tr><td>$it.name$</td><td>$it.role$</td><td>$it.contact$</td></tr>
    $endfor$
  </tbody>
</table>

<h2>RACI Matrix</h2>
<table>
  <thead><tr><th>Task</th><th>R</th><th>A</th><th>C</th><th>I</th></tr></thead>
  <tbody>
    $for(raci)$
    <tr><td>$it.task$</td><td>$it.r$</td><td>$it.a$</td><td>$it.c$</td><td>$it.i$</td></tr>
    $endfor$
  </tbody>
</table>

$for(nodes)$
<h2>$nodes.title$</h2>
$nodes.content$
$endfor$

$if(appendices)$
<h2>Appendices</h2>
$for(appendices)$
<h3>$it.title$</h3>
$it.content$
$endfor$
$endif$

</body>
</html>"""
        else:
            return """---
title: $title$
author: $author$
date: $date$
summary: $summary$
changelog:
  - { date: 2025-01-01, version: 0.1, author: $author$, note: Initial draft }
stakeholders:
  - { name: Alice, role: Sponsor, contact: alice@example.com }
raci:
  - { task: Kickoff, r: Bob, a: Alice, c: Team, i: Execs }
appendices:
  - { title: Appendix A, content: "Additional materials." }
---

# $title$

$if(toc)$
## Table of Contents
$toc$
$endif$

## Executive Summary

$summary$

## Document Changelog

| Date | Version | Author | Change |
|------|---------|--------|--------|
$for(changelog)$
| $it.date$ | $it.version$ | $it.author$ | $it.note$ |
$endfor$

## Stakeholder Registry

| Name | Role | Contact |
|------|------|---------|
$for(stakeholders)$
| $it.name$ | $it.role$ | $it.contact$ |
$endfor$

## RACI Matrix

| Task | R | A | C | I |
|------|---|---|---|---|
$for(raci)$
| $it.task$ | $it.r$ | $it.a$ | $it.c$ | $it.i$ |
$endfor$

$for(nodes)$
## $nodes.title$

$nodes.content$
$endfor$

$if(appendices)$
## Appendices
$for(appendices)$
### $it.title$

$it.content$
$endfor$
$endif$
"""