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
        self.templates_dir = os.path.normpath(os.path.join(project_path, "templates", "compiler"))
        self.supported_formats = ['markdown', 'html', 'pdf', 'docx', 'epub']
    
    def get_available_templates(self, format_type: str) -> List[Dict[str, str]]:
        """Get available templates for a specific format"""
        if format_type not in self.supported_formats:
            logger.warning(f"Unsupported format type: {format_type}")
            return []
        
        format_dir = os.path.join(self.templates_dir, format_type)
        logger.debug(f"Looking for templates in: {format_dir}")
        
        if not os.path.exists(format_dir):
            logger.warning(f"Template directory does not exist: {format_dir}")
            return []
        
        templates = []
        try:
            for filename in os.listdir(format_dir):
                if filename.endswith('.md'):
                    template_path = os.path.join(format_type, filename)
                    templates.append({
                        'name': os.path.splitext(filename)[0],
                        'path': template_path,
                        'format': format_type
                    })
                    logger.debug(f"Found template: {template_path}")
        except Exception as e:
            logger.error(f"Failed to list templates in {format_dir}: {e}")
        
        logger.debug(f"Found {len(templates)} templates for format {format_type}")
        return templates
    
    def get_template_content(self, template_path: str) -> Optional[str]:
        """Get the content of a template file"""
        # Construct the full path to the template file
        # template_path is expected to be in format like "pdf/simple.md"
        # We need to construct: {project_path}/templates/compiler/{template_path}
        full_path = os.path.normpath(os.path.join(self.templates_dir, template_path))
        logger.debug(f"Getting template content from: {full_path}")
        
        if not os.path.exists(full_path):
            logger.error(f"Template file not found: {full_path}")
            return None
        
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
                logger.debug(f"Successfully read template file, length: {len(content)}")
                logger.debug(f"Template content starts with: {content[:100]}...")
                return content
        except Exception as e:
            logger.error(f"Failed to read template {template_path} from {full_path}: {e}")
            return None
    
    def validate_template(self, template_content: str) -> Tuple[bool, List[str], Dict[str, Any], List[str]]:
        """Validate template syntax and extract custom variables and schema (variables/nodeVariables).
        Also performs light schema-structure validation to surface authoring errors early.
        Returns: (is_valid, custom_variables, schema, validation_messages)
        """
        errors = []
        custom_variables = []
        
        # Add debugging information
        logger.debug(f"Validating template content (length: {len(template_content)})")
        
        # Check for any non-printable characters that might cause issues
        non_printable_chars = [i for i, char in enumerate(template_content) if not char.isprintable() and char not in ['\n', '\r', '\t']]
        if non_printable_chars:
            logger.warning(f"Found non-printable characters at positions: {non_printable_chars[:10]}")
        
        # Check for encoding issues
        try:
            template_content.encode('utf-8')
        except UnicodeEncodeError as e:
            logger.error(f"Unicode encoding error: {e}")
            errors.append(f"Template contains invalid Unicode characters: {e}")
        
        try:
            # Check for basic Pandoc template syntax or Liquid/Jinja2 include syntax
            # First, check for ANY template syntax (including control structures)
            has_pandoc_vars = re.search(r'\$[a-zA-Z_][a-zA-Z0-9_.()\s]*\$', template_content)
            has_include_syntax = re.search(r'{%\s*include_relative\s+', template_content)
            
            logger.debug(f"Has pandoc vars: {has_pandoc_vars}")
            logger.debug(f"Has include syntax: {has_include_syntax}")
            
            if not has_pandoc_vars and not has_include_syntax:
                errors.append("Template must contain at least one variable")
                logger.error("Template validation failed: no variables or includes found")
            
            # Extract custom variables (excluding standard ones and control variables)
            standard_vars = {'title', 'author', 'date', 'toc', 'nodes', 'nodes.title', 
                           'nodes.content', 'nodes.metadata', 'nodes.attachments'}
            control_vars = {'if', 'endif', 'for', 'endfor', 'it', 'it.key', 'it.value', 
                           'it.name', 'it.size'}
            
            # Extract ALL variables first, then filter
            all_variables = re.findall(r'\$([a-zA-Z_][a-zA-Z0-9_.()\s]*)\$', template_content)
            logger.debug(f"All variables found: {all_variables}")
            
            for var in all_variables:
                # Clean up the variable name by removing parentheses and extra spaces
                clean_var = re.sub(r'[()]', '', var).strip()
                
                # Skip if it's a standard variable
                if clean_var in standard_vars:
                    continue
                
                # Skip if it's a control variable
                if clean_var in control_vars:
                    continue

                # Skip loop iterator variables like it.* (any property name)
                if clean_var == 'it' or clean_var.startswith('it.'):
                    continue
                
                # Skip if it starts with control keywords (handles cases like 'fornodes', 'ifnodes.vars')
                if clean_var.startswith(('for', 'if', 'endif', 'endfor')):
                    continue
                
                # Skip if it contains control keywords (additional safety)
                if any(keyword in clean_var for keyword in ['for', 'if', 'endif', 'endfor']):
                    continue
                
                # Skip precomputed helper/convenience variables for table types
                try:
                    if re.match(r'^[A-Za-z_]\w*_(markdown|headerSeparator|headerLine|rows|columns)$', clean_var):
                        continue
                    if re.match(r'^[A-Za-z_]\w*\.(markdown|headerSeparator|headerLine|rows|columns)$', clean_var):
                        continue
                except Exception:
                    pass

                # Add to custom variables if not already present
                if clean_var not in custom_variables:
                    custom_variables.append(clean_var)
            
            logger.debug(f"Custom variables: {custom_variables}")
            
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
                if t not in ('string','number','boolean','array','table'):
                    errors.append(f"{scope}.{k}.type must be one of string|number|boolean|array|table")
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
                if t == 'table':
                    # Optional defaults for columns/types
                    cols_def = defn.get('columnsDefault')
                    if cols_def is not None and not (isinstance(cols_def, list) and all(isinstance(x, (str, int, float, bool)) or x is None for x in cols_def)):
                        errors.append(f"{scope}.{k}.columnsDefault must be an array of strings (column names)")
                    types_def = defn.get('columnTypes')
                    if types_def is not None:
                        if not isinstance(types_def, dict):
                            errors.append(f"{scope}.{k}.columnTypes must be an object when provided")
                        else:
                            for ck, ct in types_def.items():
                                if not isinstance(ct, dict):
                                    errors.append(f"{scope}.{k}.columnTypes.{ck} must be an object")
                                    continue
                                ctype = ct.get('type', 'string')
                                if ctype not in ('string','number','boolean','enum'):
                                    errors.append(f"{scope}.{k}.columnTypes.{ck}.type must be string|number|boolean|enum")
                                if ctype == 'enum':
                                    enum_vals = ct.get('enum')
                                    if not (isinstance(enum_vals, list) and all(isinstance(ev, (str, int, float, bool)) for ev in enum_vals)):
                                        errors.append(f"{scope}.{k}.columnTypes.{ck}.enum must be an array for enum type")
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
    
    def process_includes_only(self, template_content: str, template_path: str = None) -> str:
        """Process only the include statements in a template, without processing variables or other template logic.
        This is used to resolve includes before schema extraction."""
        # Normalize newlines for consistent regex behavior
        processed_content = template_content.replace('\r\n', '\n').replace('\r', '\n')
        
        logger.debug(f"Processing includes for template: {template_path}")
        logger.debug(f"Original content length: {len(template_content)}")
        
        # Process includes - replace {% include_relative path %} with the content of the included template
        include_pattern = re.compile(r'{%\s*include_relative\s+([^}]+)\s*%}')
        
        def replace_include(match):
            include_path = match.group(1).strip()
            logger.debug(f"Processing include: {include_path}")
            
            # Resolve relative path from the template file's directory
            if template_path:
                # Get the directory of the template file
                # template_path is relative to templates_dir, so join with templates_dir
                template_file_path = os.path.normpath(os.path.join(self.templates_dir, template_path))
                template_dir = os.path.dirname(template_file_path)
                full_include_path = os.path.normpath(os.path.join(template_dir, include_path))
                logger.debug(f"Template file path: {template_file_path}")
                logger.debug(f"Template directory: {template_dir}")
                logger.debug(f"Full include path: {full_include_path}")
            else:
                # Fallback to templates/compiler directory (for backward compatibility)
                full_include_path = os.path.normpath(os.path.join(self.templates_dir, include_path))
                logger.debug(f"Fallback include path: {full_include_path}")
            
            try:
                if os.path.exists(full_include_path):
                    logger.debug(f"Include file found: {full_include_path}")
                    with open(full_include_path, 'r', encoding='utf-8') as f:
                        included_content = f.read()
                    logger.debug(f"Included content length: {len(included_content)}")
                    # Recursively process includes in the included template
                    # Pass the included template's path for correct relative path resolution
                    # The included template path should be relative to templates_dir
                    included_template_path = os.path.relpath(full_include_path, self.templates_dir)
                    logger.debug(f"Included template path: {included_template_path}")
                    return self.process_includes_only(included_content, included_template_path)
                else:
                    logger.error(f"Included template not found: {full_include_path}")
                    return f"<!-- ERROR: Included template not found: {include_path} -->"
            except Exception as e:
                logger.error(f"Error processing included template {include_path}: {e}")
                return f"<!-- ERROR: Failed to process included template {include_path}: {e} -->"
        
        result = include_pattern.sub(replace_include, processed_content)
        logger.debug(f"Processed content length: {len(result)}")
        
        # Check if the processed content still contains include statements
        remaining_includes = include_pattern.findall(result)
        if remaining_includes:
            logger.warning(f"Remaining include statements after processing: {remaining_includes}")
        
        return result
    
    def process_template(self, template_content: str, data: Dict[str, Any], template_path: str = None) -> str:
        """Process template with provided data.
        Supports a subset of Pandoc-like template syntax inside Markdown content:
        - $var$
        - $if(var)$ ... $endif$
        - $for(nodes)$ ... $endfor$
        - $if(nodes.metadata)$, $for(nodes.metadata)$ and the $it.key$/$it.value$ placeholders
        - $if(nodes.attachments)$, $for(nodes.attachments)$ and $it.name$/$it.size$
        - {% include_relative %} for including other templates
        """
        # Normalize newlines for consistent regex behavior
        processed_content = template_content.replace('\r\n', '\n').replace('\r', '\n')
        
        # Process includes first - replace {% include_relative path %} with the content of the included template
        include_pattern = re.compile(r'{%\s*include_relative\s+([^}]+)\s*%}')
        
        def replace_include(match):
            include_path = match.group(1).strip()
            
            # Resolve relative path from the template file's directory
            if template_path:
                # Get the directory of the template file
                # template_path is relative to templates_dir, so join with templates_dir
                template_file_path = os.path.normpath(os.path.join(self.templates_dir, template_path))
                template_dir = os.path.dirname(template_file_path)
                full_include_path = os.path.normpath(os.path.join(template_dir, include_path))
            else:
                # Fallback to templates/compiler directory (for backward compatibility)
                full_include_path = os.path.normpath(os.path.join(self.templates_dir, include_path))
            
            try:
                if os.path.exists(full_include_path):
                    with open(full_include_path, 'r', encoding='utf-8') as f:
                        included_content = f.read()
                    # Recursively process the included template
                    # Pass the included template's path for correct relative path resolution
                    # The included template path should be relative to templates_dir
                    included_template_path = os.path.relpath(full_include_path, self.templates_dir)
                    return self.process_template(included_content, data, included_template_path)
                else:
                    logger.error(f"Included template not found: {full_include_path}")
                    return f"<!-- ERROR: Included template not found: {include_path} -->"
            except Exception as e:
                logger.error(f"Error processing included template {include_path}: {e}")
                return f"<!-- ERROR: Failed to process included template {include_path}: {e} -->"
        
        processed_content = include_pattern.sub(replace_include, processed_content)

        # Replace simple variables first, but only when they appear as standalone tokens.
        # This avoids replacing inside node-scoped placeholders like `$nodes.title$`.
        for key, value in data.items():
            if isinstance(value, (str, bool, int, float)):
                try:
                    # Match `$key$` not immediately preceded by an identifier character or dot.
                    # Example: will match `$title$` in text, but NOT inside `$nodes.title$`.
                    pattern = re.compile(rf"(?<![A-Za-z0-9_\.])\${re.escape(str(key))}\$")
                    processed_content = pattern.sub(str(value), processed_content)
                except Exception:
                    # Fallback to naive replacement if regex compilation fails for any reason
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
        # Use non-greedy matching so multiple $for(nodes)$ blocks are processed independently
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
                # Ensure temp_file_path is absolute for cross-platform compatibility
                temp_file_path = os.path.abspath(temp_file_path)
                
                # Build pandoc command
                cmd = ['pandoc', temp_file_path, '-o', output_file]
                # Ensure resources (images) resolve relative to project root
                try:
                    if os.path.isdir(self.project_path):
                        # Use absolute path for resource-path to avoid platform-specific issues
                        abs_project_path = os.path.abspath(self.project_path)
                        cmd.extend(['--resource-path', abs_project_path])
                        logger.debug(f"Added resource path: {abs_project_path}")
                except Exception as e:
                    logger.warning(f"Failed to add resource path: {e}")
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
                
                # Log command for debugging
                logger.debug(f"Pandoc command: {' '.join(cmd)}")
                logger.debug(f"Working directory: {working_dir}")
                logger.debug(f"Temp file path: {temp_file_path}")
                
                # Run pandoc with working directory if provided
                if working_dir:
                    result = subprocess.run(cmd, capture_output=True, text=True, cwd=working_dir)
                else:
                    result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode != 0:
                    error_msg = result.stderr.strip()
                    logger.error(f"Pandoc conversion failed with return code {result.returncode}")
                    logger.error(f"Pandoc stderr: {error_msg}")
                    logger.error(f"Pandoc stdout: {result.stdout.strip()}")
                    
                    if "xelatex" in error_msg and output_format == 'pdf':
                        # Try with pdflatex as fallback
                        cmd = ['pandoc', temp_file_path, '-o', output_file, '--pdf-engine=pdflatex']
                        logger.debug(f"Retrying with pdflatex: {' '.join(cmd)}")
                        if working_dir:
                            result = subprocess.run(cmd, capture_output=True, text=True, cwd=working_dir)
                        else:
                            result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode != 0:
                            logger.error(f"Pandoc PDF conversion failed with pdflatex: {result.stderr}")
                            return False, f"Pandoc PDF conversion failed: {result.stderr}"
                    else:
                        return False, f"Pandoc conversion failed: {error_msg}"
                
                return True, "Conversion successful"
                
            finally:
                # Clean up temporary file
                try:
                    if os.path.exists(temp_file_path):
                        os.unlink(temp_file_path)
                except Exception as e:
                    logger.warning(f"Failed to clean up temporary file {temp_file_path}: {e}")
                
        except FileNotFoundError:
            return False, "Pandoc is not installed. Please install Pandoc to use this feature."
        except Exception as e:
            logger.error(f"Pandoc conversion error: {str(e)}")
            return False, f"Pandoc conversion error: {str(e)}"
    
    def create_default_templates(self) -> None:
        """Deprecated: defaults now come from repository assets and global templates directory."""
        try:
            self.templates_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
    
    def _get_simple_template(self, format_type: str) -> str:
        """Deprecated: templates now live in assets and are copied, not generated."""
        raise NotImplementedError("Default templates are provided via assets")
    
    def _get_academic_template(self, format_type: str) -> str:
        """Deprecated: templates now live in assets and are copied, not generated."""
        raise NotImplementedError("Default templates are provided via assets")

    def _get_technical_report_template(self, format_type: str) -> str:
        """Deprecated: templates now live in assets and are copied, not generated."""
        raise NotImplementedError("Default templates are provided via assets")