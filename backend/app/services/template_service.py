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
    
    def validate_template(self, template_content: str) -> Tuple[bool, List[str], Dict[str, Any], List[str]]:
        """Validate template syntax and extract custom variables and schema (variables/nodeVariables).
        Also performs light schema-structure validation to surface authoring errors early.
        Returns: (is_valid, custom_variables, schema, validation_messages)
        """
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
        
        # Extract schema from frontmatter if present
        schema: Dict[str, Any] = {}
        try:
            if template_content.startswith('---'):
                text = template_content.split('\n', 1)[1]
                fm_text, _rest = None, None
                if '\n---\n' in text:
                    fm_text, _rest = text.split('\n---\n', 1)
                elif '\r\n---\r\n' in text:
                    fm_text, _rest = text.split('\r\n---\r\n', 1)
                if fm_text is not None:
                    fm = yaml.safe_load(fm_text) or {}
                    if isinstance(fm, dict):
                        schema = {
                            'variables': fm.get('variables') or {},
                            'nodeVariables': fm.get('nodeVariables') or {}
                        }
        except Exception:
            schema = {}

        # Lightweight schema validation
        try:
            def _is_primitive_type(t: Any) -> bool:
                return t in ('string', 'number', 'boolean')

            def _validate_compute(defn: Dict[str, Any]):
                comp = defn.get('compute')
                if comp is None:
                    return
                if not isinstance(comp, dict):
                    errors.append('compute must be an object with fn and optional args')
                    return
                fn = comp.get('fn')
                if not isinstance(fn, str) or not fn:
                    errors.append('compute.fn must be a non-empty string')
                args = comp.get('args', [])
                if args is not None and not isinstance(args, list):
                    errors.append('compute.args must be an array if provided')
                # Optional: check against allowed function names (keep in sync with compiler)
                allowed_fns = {
                    'cvss.baseScore','cvss.severity',
                    'mean','sum','round','math.mean','math.sum','math.round',
                    'min','max','count','math.min','math.max','count',
                    'string.upper','string.lower','string.regexMatch',
                    'date.now','date.today'
                }
                if isinstance(fn, str) and fn not in allowed_fns:
                    # Not fatal; warn to help authors
                    errors.append(f"Unknown compute.fn '{fn}' (will be ignored if unsupported)")

            def _validate_var_def(k: str, defn: Any, scope: str):
                if not isinstance(defn, dict):
                    errors.append(f"{scope}.{k} must be an object")
                    return
                t = defn.get('type')
                if t not in ('string','number','boolean','array'):
                    errors.append(f"{scope}.{k}.type must be one of string|number|boolean|array")
                if t == 'array':
                    item = defn.get('item')
                    if not isinstance(item, dict):
                        errors.append(f"{scope}.{k}.item must be an object when type is array")
                    else:
                        if item.get('type') == 'object':
                            fields = item.get('fields')
                            if not isinstance(fields, dict) or not fields:
                                errors.append(f"{scope}.{k}.item.fields must be a non-empty object for object arrays")
                            else:
                                for fk, fv in fields.items():
                                    if not isinstance(fv, dict):
                                        errors.append(f"{scope}.{k}.item.fields.{fk} must be an object")
                                    elif not _is_primitive_type(fv.get('type','string')):
                                        errors.append(f"{scope}.{k}.item.fields.{fk}.type must be string|number|boolean")
                        else:
                            # primitive array
                            if not _is_primitive_type(item.get('type','string')):
                                errors.append(f"{scope}.{k}.item.type must be string|number|boolean")
                if scope == 'nodeVariables':
                    # Optional dotted path
                    if 'path' in defn and not isinstance(defn.get('path'), str):
                        errors.append(f"{scope}.{k}.path must be a string if provided")
                # Validate compute if present
                _validate_compute(defn)

            # variables
            if isinstance(schema.get('variables'), dict):
                for k, defn in schema['variables'].items():
                    _validate_var_def(str(k), defn, 'variables')
            elif schema.get('variables') not in (None, {}):
                errors.append('variables must be an object')

            # nodeVariables
            if isinstance(schema.get('nodeVariables'), dict):
                for k, defn in schema['nodeVariables'].items():
                    _validate_var_def(str(k), defn, 'nodeVariables')
            elif schema.get('nodeVariables') not in (None, {}):
                errors.append('nodeVariables must be an object')
        except Exception as e:
            errors.append(f"Schema validation error: {e}")
        
        return len(errors) == 0, custom_variables, (schema or {'variables': {}, 'nodeVariables': {}}), errors
    
    def process_template(self, template_content: str, data: Dict[str, Any]) -> str:
        """Process template with provided data.
        Supports a subset of Pandoc-like template syntax inside Markdown content:
        - $var$
        - $if(var)$ ... $endif$
        - $for(nodes)$ ... $endfor$
        - $if(nodes.metadata)$, $for(nodes.metadata)$ and the $it.key$/$it.value$ placeholders
        - $if(nodes.attachments)$, $for(nodes.attachments)$ and $it.name$/$it.size$
        """
        # Normalize newlines for consistent regex behavior
        processed_content = template_content.replace('\r\n', '\n').replace('\r', '\n')

        # Replace simple variables first
        for key, value in data.items():
            if isinstance(value, (str, bool, int, float)):
                processed_content = processed_content.replace(f'${key}$', str(value))

        # Top-level conditionals like $if(toc)$ ... $endif$, plus $if(nodes)$ and $ifnot(nodes)$
        def compute_truthy(value: Any) -> bool:
            if isinstance(value, list):
                return len(value) > 0
            return bool(value)

        def replace_top_level_if(var_name: str, text: str) -> str:
            pattern = re.compile(rf"\$if\({re.escape(var_name)}\)\$(.*?)\$endif\$", re.DOTALL)
            truthy = compute_truthy(data.get(var_name))
            return pattern.sub(lambda m: m.group(1) if truthy else '', text)

        def replace_top_level_ifnot(var_name: str, text: str) -> str:
            pattern = re.compile(rf"\$ifnot\({re.escape(var_name)}\)\$(.*?)\$endif\$", re.DOTALL)
            truthy = compute_truthy(data.get(var_name))
            return pattern.sub(lambda m: m.group(1) if not truthy else '', text)

        for cond in ['toc', 'includeMetadata', 'include_metadata', 'nodes']:
            processed_content = replace_top_level_if(cond, processed_content)
            processed_content = replace_top_level_ifnot(cond, processed_content)

        # Helper to resolve dotted path against arbitrary data dict
        def resolve_path(expr: str, ctx: Dict[str, Any]) -> Any:
            cur: Any = ctx
            for part in str(expr).split('.') if expr else []:
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    return None
            return cur

        # Generic top-level loops for document variables: $for(var)$...$endfor$
        # Supports arrays of primitives/objects and dicts.
        # IMPORTANT: Do NOT consume $for(nodes)$ here; nodes require special processing later.
        loop_pat = re.compile(r"\$for\(([a-zA-Z_][a-zA-Z0-9_\.]*)\)\$(.*?)\$endfor\$", re.DOTALL)
        pos = 0
        rebuilt: List[str] = []
        while True:
            m = loop_pat.search(processed_content, pos)
            if not m:
                rebuilt.append(processed_content[pos:])
                break
            expr = m.group(1)
            inner = m.group(2)
            # Leave $for(nodes)$ blocks untouched for node-specific processing
            if expr.startswith('nodes'):
                rebuilt.append(processed_content[pos:m.end()])
                pos = m.end()
                continue
            value = resolve_path(expr, data)
            rendered = ''
            if isinstance(value, list):
                items_out: List[str] = []
                for it in value:
                    chunk = inner
                    if isinstance(it, dict):
                        for k, v in it.items():
                            chunk = chunk.replace(f'$it.{k}$', str(v))
                    else:
                        chunk = chunk.replace('$it$', str(it))
                    items_out.append(chunk)
                rendered = '\n'.join(items_out)
            elif isinstance(value, dict):
                items_out = []
                for k, v in value.items():
                    chunk = inner
                    chunk = chunk.replace('$it.key$', str(k))
                    chunk = chunk.replace('$it.value$', str(v))
                    items_out.append(chunk)
                rendered = '\n'.join(items_out)
            else:
                rendered = ''
            rebuilt.append(processed_content[pos:m.start()])
            rebuilt.append(rendered)
            pos = m.end()
        processed_content = ''.join(rebuilt)

        # Generate a basic Table of Contents if requested and placeholder is present
        if data.get('toc') and '$toc$' in processed_content:
            toc_md = self._generate_basic_toc(data.get('nodes', []))
            processed_content = processed_content.replace('$toc$', toc_md)

        # Handle nodes array and node-scoped controls
        if 'nodes' in data:
            # Process all occurrences of $for(nodes)$ blocks iteratively
            prev = None
            while prev != processed_content:
                prev = processed_content
                processed_content = self._process_nodes_array(processed_content, data['nodes'])

        # Final safety cleanup: strip any leftover control tokens to prevent leaking into output
        # This only removes the markers; at this point, content should already be correctly included/excluded.
        processed_content = re.sub(r"\$if\([^)]+\)\$", '', processed_content)
        processed_content = re.sub(r"\$ifnot\([^)]+\)\$", '', processed_content)
        processed_content = processed_content.replace('$endif$', '')

        return processed_content
    
    def _process_nodes_array(self, template: str, nodes: List[Dict[str, Any]]) -> str:
        """Process all $for(nodes)$ ... $endfor$ loops in the template (zero or more occurrences)."""
        pattern = re.compile(r'\$for\(nodes\)\$(.*?)\$endfor\$', re.DOTALL)
        out_parts: List[str] = []
        idx = 0
        while True:
            m = pattern.search(template, idx)
            if not m:
                out_parts.append(template[idx:])
                break

            # Append text before this loop
            out_parts.append(template[idx:m.start()])

            loop_content = m.group(1)
            rendered_nodes: List[str] = []

            for node in nodes:
                node_block = loop_content

            # Helper: resolve dotted expression like nodes.vars.appendix against current node
            def resolve_node_expr(expr: str, node_obj: Dict[str, Any]) -> Any:
                try:
                    path_expr = expr.strip()
                    if path_expr.startswith('nodes.'):
                        path_expr = path_expr[len('nodes.'):]
                    cur: Any = node_obj
                    for part in str(path_expr).split('.') if path_expr else []:
                        if isinstance(cur, dict) and part in cur:
                            cur = cur[part]
                        else:
                            return None
                    return cur
                except Exception:
                    return None

            # Helper: recursively replace $nodes.<path>$ for nested dicts
            def replace_nested(prefix: str, obj: Any, text: str) -> str:
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        text = replace_nested(f"{prefix}.{k}", v, text)
                elif isinstance(obj, list):
                    # No direct single placeholder replacement for lists; handled via loops if needed
                    pass
                else:
                    text = text.replace(f'$nodes.{prefix}$', str(obj))
                return text

            # Replace scalar node fields, e.g., $nodes.title$, $nodes.content$ and nested dicts like metadata.*, vars.*
            for key, value in node.items():
                if isinstance(value, (str, int, float)):
                    node_block = node_block.replace(f'$nodes.{key}$', str(value))
                elif isinstance(value, dict):
                    node_block = replace_nested(key, value, node_block)

            # Node-scoped conditionals: support $if(nodes.<path>)$ ... $endif$ and $ifnot(nodes.<path>)$ ... $endif$
            def apply_node_conditionals(text: str) -> str:
                # $if(expr)$ ... $endif$
                if_pat = re.compile(r"\$if\(([^)]+)\)\$(.*?)\$endif\$", re.DOTALL)
                # $ifnot(expr)$ ... $endif$
                ifnot_pat = re.compile(r"\$ifnot\(([^)]+)\)\$(.*?)\$endif\$", re.DOTALL)

                # Single-pass evaluation to avoid nesting issues
                def if_repl(m):
                    expr = m.group(1).strip()
                    if expr.startswith('nodes.'):
                        val = resolve_node_expr(expr, node)
                        return m.group(2) if bool(val) else ''
                    return m.group(0)

                def ifnot_repl(m):
                    expr = m.group(1).strip()
                    if expr.startswith('nodes.'):
                        val = resolve_node_expr(expr, node)
                        return m.group(2) if (not bool(val)) else ''
                    return m.group(0)

                text = if_pat.sub(if_repl, text)
                text = ifnot_pat.sub(ifnot_repl, text)
                return text

            # Also support legacy convenience checks for metadata/vars/attachments presence
            has_meta = isinstance(node.get('metadata'), dict) and len(node.get('metadata')) > 0
            if has_meta:
                node_block = re.sub(r"\$if\(nodes\.metadata\)\$(.*?)\$endif\$", lambda m: m.group(1), node_block, flags=re.DOTALL)
            else:
                node_block = re.sub(r"\$if\(nodes\.metadata\)\$(.*?)\$endif\$", '', node_block, flags=re.DOTALL)

            has_vars = isinstance(node.get('vars'), dict) and len(node.get('vars')) > 0
            if has_vars:
                node_block = re.sub(r"\$if\(nodes\.vars\)\$(.*?)\$endif\$", lambda m: m.group(1), node_block, flags=re.DOTALL)
            else:
                node_block = re.sub(r"\$if\(nodes\.vars\)\$(.*?)\$endif\$", '', node_block, flags=re.DOTALL)

            has_atts = isinstance(node.get('attachments'), list) and len(node.get('attachments')) > 0
            if has_atts:
                node_block = re.sub(r"\$if\(nodes\.attachments\)\$(.*?)\$endif\$", lambda m: m.group(1), node_block, flags=re.DOTALL)
            else:
                node_block = re.sub(r"\$if\(nodes\.attachments\)\$(.*?)\$endif\$", '', node_block, flags=re.DOTALL)

            # Apply generic node conditionals ($if(nodes.path)$ and $ifnot(nodes.path)$)
            node_block = apply_node_conditionals(node_block)

            # Expand metadata loop $for(nodes.metadata)$ ... $endfor$ (all occurrences)
            while True:
                meta_loop = re.search(r'\$for\(nodes\.metadata\)\$(.*?)\$endfor\$', node_block, re.DOTALL)
                if not meta_loop:
                    break
                inner = meta_loop.group(1)
                items: List[str] = []
                if has_meta:
                    for mk, mv in node.get('metadata', {}).items():
                        item = inner
                        item = item.replace('$it.key$', str(mk))
                        item = item.replace('$it.value$', str(mv))
                        items.append(item)
                node_block = node_block.replace(meta_loop.group(0), '\n'.join(items))

            # Expand vars loop $for(nodes.vars)$ ... $endfor$ (all occurrences)
            while True:
                vars_loop = re.search(r'\$for\(nodes\.vars\)\$(.*?)\$endfor\$', node_block, re.DOTALL)
                if not vars_loop:
                    break
                inner = vars_loop.group(1)
                items: List[str] = []
                if has_vars:
                    for mk, mv in node.get('vars', {}).items():
                        item = inner
                        item = item.replace('$it.key$', str(mk))
                        item = item.replace('$it.value$', str(mv))
                        items.append(item)
                node_block = node_block.replace(vars_loop.group(0), '\n'.join(items))

            # Expand attachments loop $for(nodes.attachments)$ ... $endfor$ (all occurrences)
            while True:
                att_loop = re.search(r'\$for\(nodes\.attachments\)\$(.*?)\$endfor\$', node_block, re.DOTALL)
                if not att_loop:
                    break
                inner = att_loop.group(1)
                items: List[str] = []
                if has_atts:
                    for att in node.get('attachments', []):
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
            # Always append the processed node block
            rendered_nodes.append(node_block)

            out_parts.append('\n\n'.join(rendered_nodes))
            idx = m.end()

        return ''.join(out_parts)

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
                if options and (options.get('includeTOC') or options.get('includeToc') or options.get('includeToc') is True or options.get('includeToc') == 'true'):
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
    $if(nodes.vars)$
    <h3>Variables</h3>
    <ul>
    $for(nodes.vars)$
      <li><strong>$it.key$:</strong> $it.value$</li>
    $endfor$
    </ul>
    $endif$
    $endfor$
</body>
</html>"""
        else:
            return """---
title: $title$
author: $author$
date: $date$
variables:
  toc:
    type: boolean
    description: Include a generated table of contents at the top.
nodeVariables:
  cvss:
    type: number
    description: Optional CVSS base score if present on a node's metadata.
    path: metadata.cvss
---

# $title$

$if(toc)$
## Table of Contents
$toc$
$endif$

$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.vars)$
### Variables
$for(nodes.vars)$
- $it.key$: $it.value$
$endfor$
$endif$

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
    
    $if(nodes.vars)$
    <div class="metadata">
        <h3>Variables</h3>
        $for(nodes.vars)$
        <p><strong>$it.key$:</strong> $it.value$</p>
        $endfor$
    </div>
    $endif$

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
variables:
  toc:
    type: boolean
    description: Include a generated table of contents.
  includeMetadata:
    type: boolean
    description: Show each node's metadata under its content.
nodeVariables:
  cvss_vector:
    type: string
    description: Optional CVSS v3 vector from node metadata.
    path: metadata.cvss_vector
  cvss:
    type: number
    description: Optional CVSS base score from node metadata.
    path: metadata.cvss
---

# $title$

$if(toc)$
## Table of Contents
$toc$
$endif$

$for(nodes)$
## $nodes.title$

$nodes.content$

$if(nodes.vars)$
### Variables
$for(nodes.vars)$
- **$it.key$:** $it.value$
$endfor$
$endif$

$if(includeMetadata)$
$if(nodes.metadata)$
### Metadata
$for(nodes.metadata)$
- **$it.key$:** $it.value$
$endfor$
$endif$
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

 <h2>Appendices</h2>

</body>
</html>"""
        else:
            return """---
title: $title$
author: $author$
date: $date$
summary: $summary$
variables:
  toc:
    type: boolean
    description: Include a generated table of contents.
  summary:
    type: string
    description: Executive summary paragraph.
  changelog:
    type: array
    item:
      type: object
      fields:
        date: { type: string }
        version: { type: string }
        author: { type: string }
        note: { type: string }
  stakeholders:
    type: array
    item:
      type: object
      fields:
        name: { type: string }
        role: { type: string }
        contact: { type: string }
  raci:
    type: array
    item:
      type: object
      fields:
        task: { type: string }
        r: { type: string }
        a: { type: string }
        c: { type: string }
        i: { type: string }
nodeVariables:
  appendix:
    type: boolean
    label: Appendix
    description: Treat this node as an appendix section
    path: metadata.appendix
    default: false
  cvss_vector:
    type: string
    description: Optional CVSS v3 vector string from node metadata.
    path: metadata.cvss_vector
  cvss:
    type: number
    description: Optional CVSS base score from node metadata.
    path: metadata.cvss
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
$ifnot(nodes.vars.appendix)$
## $nodes.title$

$nodes.content$
$endif$
$endfor$

$if(nodes)$
## Appendices
$for(nodes)$
$if(nodes.vars.appendix)$
### $nodes.title$

$nodes.content$
$endif$
$endfor$
$endif$
"""