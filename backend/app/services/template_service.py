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

# LaTeX preamble added to every PDF export so long lines in code blocks wrap
# instead of running off the page. Pandoc renders highlighted blocks in a
# fancyvrb `Highlighting` environment and untagged blocks in `verbatim`;
# fvextra adds line breaking to both. Pandoc emits header-includes after its
# own highlighting macros, so these definitions take precedence.
# In highlighted blocks each token is a macro argument (e.g. \StringTok{...}),
# which fvextra's breakanywhere does not reach, so every token macro Pandoc
# defined is wrapped in \FancyVerbBreakStart/\FancyVerbBreakStop. Tokens that
# are not defined (no highlighted block, other Pandoc version) are skipped.
PDF_CODE_WRAP_HEADER = r"""
\usepackage{fvextra}
\DefineVerbatimEnvironment{Highlighting}{Verbatim}{breaklines,breakanywhere,commandchars=\\\{\}}
\DefineVerbatimEnvironment{verbatim}{Verbatim}{breaklines,breakanywhere}
\makeatletter
\newcommand*\vw@breakabletok[1]{%
  \@ifundefined{#1}{}{%
    \expandafter\let\csname vw@orig@#1\expandafter\endcsname\csname #1\endcsname
    \expandafter\def\csname #1\endcsname##1{%
      \csname vw@orig@#1\endcsname{\FancyVerbBreakStart##1\FancyVerbBreakStop}}}}
\@for\vw@tok:=AlertTok,AnnotationTok,AttributeTok,BaseNTok,BuiltInTok,CharTok,%
CommentTok,CommentVarTok,ConstantTok,ControlFlowTok,DataTypeTok,DecValTok,%
DocumentationTok,ErrorTok,ExtensionTok,FloatTok,FunctionTok,ImportTok,%
InformationTok,KeywordTok,NormalTok,OperatorTok,OtherTok,PreprocessorTok,%
RegionMarkerTok,SpecialCharTok,SpecialStringTok,StringTok,VariableTok,%
VerbatimStringTok,WarningTok\do{\expandafter\vw@breakabletok\expandafter{\vw@tok}}
\makeatother
"""

# Pandoc Lua filter added to every PDF export so long inline `code` spans wrap
# instead of running off the page. Pandoc renders inline code as \texttt{...},
# which has no break points; this splits each span into chunks joined by a
# small-penalty break, so TeX can break inside it like a hyphenation point
# (without the hyphen). Mirrors TeX's English hyphenation minimums: never
# split off fewer than 2 leading or 3 trailing characters. Splitting drops
# inline syntax-highlighting classes, since per-chunk highlighting is meaningless.
PDF_INLINE_CODE_WRAP_FILTER = r"""
local BREAK = '\\penalty50{}'
local LEFT_MIN, RIGHT_MIN = 2, 3

function Code(el)
  if not FORMAT:match('latex') then return nil end
  local chars = {}
  for _, cp in utf8.codes(el.text) do chars[#chars + 1] = utf8.char(cp) end
  local n = #chars
  if n < LEFT_MIN + RIGHT_MIN then return nil end
  local out, chunk = {}, {}
  for i = 1, n do
    chunk[#chunk + 1] = chars[i]
    if i >= LEFT_MIN and i <= n - RIGHT_MIN then
      out[#out + 1] = pandoc.Code(table.concat(chunk))
      out[#out + 1] = pandoc.RawInline('latex', BREAK)
      chunk = {}
    end
  end
  out[#out + 1] = pandoc.Code(table.concat(chunk))
  return out
end
"""


def _write_temp_file(content: str, suffix: str) -> str:
    """Write content to a new temporary file and return its absolute path."""
    with tempfile.NamedTemporaryFile(mode='w', suffix=suffix,
                                     delete=False, encoding='utf-8') as f:
        f.write(content)
        return os.path.abspath(f.name)

# A control tag alone on its line ($if(x)$, $endfor$, ...) takes its line break with it, as in
# Pandoc templates, so blocks don't leave blank lines (which would split Markdown tables).
_CONTROL_LINE_RE = re.compile(
    r'(?m)^[ \t]*(\$(?:if|ifnot|for)\([^)\n]*\)\$|\$(?:endif|endfor|else)\$)[ \t]*\n'
)


def _strip_control_lines(text: str) -> str:
    return _CONTROL_LINE_RE.sub(r'\1', text)


# --- Nested $if$ / $for$ blocks (#135) ---------------------------------------------------------
#
# Templates are parsed into a tree so blocks can nest: an $if$ inside an $if$, a $for$ inside a
# $for$, and $else$ / $sep$ belonging to the innermost open block. Rendering walks the tree with
# a `resolve(expr, item)` callback; blocks a pass can't evaluate yet (for example node-scoped ones
# while rendering the document) are written back out unchanged, with their contents rendered.

_BLOCK_TOKEN_RE = re.compile(r'\$(if|ifnot|for)\(([^)\n]*)\)\$|\$(else|endif|endfor|sep)\$')


class _Block:
    __slots__ = ('kind', 'expr', 'open_tag', 'first', 'second', 'has_second')

    def __init__(self, kind: str, expr: str, open_tag: str):
        self.kind = kind          # 'if', 'ifnot' or 'for'
        self.expr = expr.strip()
        self.open_tag = open_tag  # original text, for writing deferred blocks back out
        self.first: List[Any] = []   # if: true branch; for: loop body
        self.second: List[Any] = []  # if: $else$ branch; for: $sep$ separator
        self.has_second = False

    def separator_tag(self) -> str:
        return '$sep$' if self.kind == 'for' else '$else$'

    def close_tag(self) -> str:
        return '$endfor$' if self.kind == 'for' else '$endif$'


def _parse_blocks(text: str) -> List[Any]:
    """Parse text into strings and _Blocks. Tags that don't match up are kept as plain text, and
    blocks left open at the end are written out as they were."""
    root: List[Any] = []
    stack: List[_Block] = []

    def current() -> List[Any]:
        if not stack:
            return root
        b = stack[-1]
        return b.second if b.has_second else b.first

    pos = 0
    for m in _BLOCK_TOKEN_RE.finditer(text):
        if m.start() > pos:
            current().append(text[pos:m.start()])
        pos = m.end()
        opener, expr, word = m.group(1), m.group(2), m.group(3)
        if opener:
            block = _Block(opener, expr or '', m.group(0))
            current().append(block)
            stack.append(block)
        elif word in ('endif', 'endfor'):
            want = 'for' if word == 'endfor' else ('if', 'ifnot')
            if stack and stack[-1].kind in want:
                stack.pop()
            else:
                current().append(m.group(0))
        else:  # else / sep
            want = 'for' if word == 'sep' else ('if', 'ifnot')
            if stack and stack[-1].kind in want and not stack[-1].has_second:
                stack[-1].has_second = True
            else:
                current().append(m.group(0))
    if pos < len(text):
        current().append(text[pos:])
    # Unclosed blocks: write them back as text so nothing is lost
    while stack:
        block = stack.pop()
        parent = current()
        idx = next(i for i in range(len(parent) - 1, -1, -1) if parent[i] is block)
        parent[idx] = _serialize_block(block, _serialize_nodes, closed=False)
    return root


def _serialize_nodes(nodes: List[Any]) -> str:
    return ''.join(n if isinstance(n, str) else _serialize_block(n, _serialize_nodes) for n in nodes)


def _serialize_block(block: _Block, render_children, closed: bool = True) -> str:
    out = block.open_tag + render_children(block.first)
    if block.has_second:
        out += block.separator_tag() + render_children(block.second)
    return out + (block.close_tag() if closed else '')


def _truthy(value: Any) -> bool:
    if isinstance(value, (list, dict, str)):
        return len(value) > 0
    return bool(value)


def _substitute_item(text: str, item: Any) -> str:
    """Replace $it$ / $it.field$ (and nested $it.a.b$) with the current loop item."""
    if isinstance(item, dict):
        def flatten(prefix: str, obj: Any, out: Dict[str, Any]):
            for k, v in obj.items():
                key = f'{prefix}.{k}'
                if isinstance(v, dict):
                    flatten(key, v, out)
                out[key] = v
        values: Dict[str, Any] = {}
        flatten('it', item, values)
        # Longest keys first, so $it.a.b$ is replaced before $it.a$
        for key in sorted(values, key=len, reverse=True):
            text = text.replace(f'${key}$', str(values[key]))
        return text
    return text.replace('$it$', str(item))


def _render_blocks(text: str, resolve, defer, unresolved_loop=None, item: Any = None) -> str:
    """Render $if$/$ifnot$/$for$ blocks in `text`, nested to any depth.

    resolve(expr, item) -> value of an expression (`item` is the current loop item, or None)
    defer(kind, expr)   -> True to leave this block for a later stage (its contents are still rendered)
    unresolved_loop(expr) -> text for a $for$ over something that isn't a list or dict
    """
    def render(nodes: List[Any], item: Any) -> str:
        out: List[str] = []
        for node in nodes:
            if isinstance(node, str):
                out.append(node)
                continue
            # $it$ inside a block that a later stage will expand has no item yet: leave it too
            uses_item = node.expr == 'it' or node.expr.startswith('it.')
            if defer(node.kind, node.expr) or (uses_item and item is None):
                out.append(_serialize_block(node, lambda children: render(children, item)))
                continue
            if node.kind in ('if', 'ifnot'):
                value = _truthy(resolve(node.expr, item))
                if node.kind == 'ifnot':
                    value = not value
                out.append(render(node.first if value else node.second, item))
                continue
            value = resolve(node.expr, item)
            if isinstance(value, dict):
                items = [{'key': k, 'value': v} for k, v in value.items()]
            elif isinstance(value, list):
                items = value
            else:
                out.append(unresolved_loop(node.expr) if unresolved_loop else '')
                continue
            # Inner blocks first (they bind their own $it$), then this loop's item
            parts = [_substitute_item(render(node.first, element), element) for element in items]
            if node.has_second:
                separator = render(node.second, item)
                out.append(separator.join(parts))
            else:
                out.append(''.join(parts))
        return ''.join(out)

    try:
        return render(_parse_blocks(text), item)
    except Exception as e:  # pragma: no cover - fail safe: never lose the user's text
        logger.error(f"Template block rendering failed: {e}")
        return text


def _resolve_dotted(expr: str, root: Any) -> Any:
    cur: Any = root
    for part in expr.split('.') if expr else []:
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _item_or(resolver):
    """Wrap a resolver so 'it' and 'it.x' refer to the current loop item."""
    def resolve(expr: str, item: Any) -> Any:
        if expr == 'it':
            return item
        if expr.startswith('it.'):
            return _resolve_dotted(expr[3:], item) if isinstance(item, dict) else None
        return resolver(expr)
    return resolve


class TemplateService:
    """Service for managing and processing export templates"""
    
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.templates_dir = os.path.normpath(os.path.join(project_path, "templates", "compiler"))
        self.supported_formats = ['markdown', 'html', 'pdf', 'docx', 'epub', 'odt']
    
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
            
            # Check for balanced delimiters in the template body. The front matter (schema) and
            # ${...} compute selectors use single '$' characters legitimately, so skip them.
            body = template_content
            if body.startswith('---'):
                fm_end = re.search(r'\n---[ \t]*\r?\n', body[3:])
                if fm_end:
                    body = body[3 + fm_end.end():]
            body = re.sub(r'\$\{[^}\n]*\}', '', body)
            if body.count('$') % 2 != 0:
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
        processed_content = _strip_control_lines(processed_content)

        # Replace simple variables first, but only when they appear as standalone tokens.
        # This avoids replacing inside node-scoped placeholders like `$nodes.title$`.
        for key, value in data.items():
            if key == 'toc':
                continue  # $toc$ is the table of contents, not the include-TOC flag
            if isinstance(value, (str, bool, int, float)):
                try:
                    # Match `$key$` not immediately preceded by an identifier character or dot.
                    # Example: will match `$title$` in text, but NOT inside `$nodes.title$`.
                    pattern = re.compile(rf"(?<![A-Za-z0-9_\.])\${re.escape(str(key))}\$")
                    processed_content = pattern.sub(str(value), processed_content)
                except Exception:
                    # Fallback to naive replacement if regex compilation fails for any reason
                    processed_content = processed_content.replace(f'${key}$', str(value))

        # Helper to resolve dotted path against arbitrary data dict
        def resolve_path(expr: str, ctx: Dict[str, Any]) -> Any:
            cur: Any = ctx
            for part in str(expr).split('.') if expr else []:
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    return None
            return cur

        # $if$/$ifnot$/$for$ blocks over document data, nested to any depth (#135). Node-scoped
        # blocks ($if(nodes.x)$ and loops over nodes) are left for the per-node step below.
        processed_content = _render_blocks(
            processed_content,
            _item_or(lambda expr: resolve_path(expr, data)),
            lambda kind, expr: expr.startswith('nodes.') or (kind == 'for' and expr == 'nodes'),
        )

        # Generate a basic Table of Contents if requested and placeholder is present
        if '$toc$' in processed_content:
            toc_md = self._generate_basic_toc(data.get('nodes', [])) if data.get('toc') else ''
            processed_content = processed_content.replace('$toc$', toc_md)

        # Handle nodes array and node-scoped controls
        if 'nodes' in data:
            # Process all occurrences of $for(nodes)$ blocks iteratively
            prev = None
            while prev != processed_content:
                prev = processed_content
                processed_content = self._process_nodes_array(processed_content, data['nodes'])

        # Final safety cleanup: only strip leftover NON-node-scoped control tokens here.
        # Leave node-scoped markers for potential later passes.
        processed_content = re.sub(r"\$if\((?!nodes\.)[^)]+\)\$", '', processed_content)
        processed_content = re.sub(r"\$ifnot\((?!nodes\.)[^)]+\)\$", '', processed_content)

        return processed_content

    def evaluate_inline(self, text: str, data: Dict[str, Any], options: Optional[Dict[str, Any]] = None) -> str:
        """Re-evaluate variables/conditionals/loops in already-rendered text without processing includes.
        This supports multi-pass evaluation for variables embedded in node content. It can optionally
        re-process $for(nodes)$ blocks based on options (defaults to True).
        """
        try:
            import re as _re
        except Exception:
            _re = re

        # Normalize newlines for consistent regex behavior
        processed_content = text.replace('\r\n', '\n').replace('\r', '\n')

        # Replace simple top-level variables first (standalone tokens only)
        for key, value in data.items():
            if key == 'toc':
                continue
            if isinstance(value, (str, bool, int, float)):
                try:
                    pattern = re.compile(rf"(?<![A-Za-z0-9_\.])\${re.escape(str(key))}\$")
                    processed_content = pattern.sub(str(value), processed_content)
                except Exception:
                    processed_content = processed_content.replace(f'${key}$', str(value))

        # Helper to resolve dotted path where the first segment may include hyphens (e.g., node-<ID>)
        def resolve_any_path(expr: str, ctx: Dict[str, Any]) -> Any:
            try:
                expr = str(expr).strip()
                if not expr:
                    return None
                # Split first segment (allow '-') and the rest by '.'
                first, dot, rest = expr.partition('.')
                cur: Any = ctx.get(first)
                if not dot:
                    return cur
                for part in rest.split('.') if rest else []:
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        return None
                return cur
            except Exception:
                return None

        # Blocks over document data and other nodes (node-<ID>.x), nested to any depth (#135);
        # node-scoped blocks are left for the nodes re-processing below
        show_markers = bool(options and options.get('showUnresolvedMarkers'))
        processed_content = _render_blocks(
            processed_content,
            _item_or(lambda expr: resolve_any_path(expr, data)),
            lambda kind, expr: expr.startswith('nodes.') or (kind == 'for' and expr == 'nodes'),
            unresolved_loop=(lambda expr: f"<!-- unresolved: {expr} -->") if show_markers else None,
        )

        # Replace scalar dotted placeholders that are not node-scoped (skip nodes.*)
        # IMPORTANT: Do not consume TeX inline math like $x^2$ or $\alpha+\beta$.
        # We only replace tokens that look like identifiers/paths. Allow hyphens in first segment
        # to support node-id aliases like node-<id> paths.
        token_pat = re.compile(r"\$([A-Za-z0-9_\-][A-Za-z0-9_\-\.]*?)\$")
        def replace_token(m):
            expr = (m.group(1) or '').strip()
            # Skip control tokens
            if expr.startswith(('if(', 'ifnot(', 'for(')) or expr in ('endif', 'endfor'):
                return m.group(0)
            # Skip nodes.* (processed below if enabled)
            if expr.startswith('nodes.'):
                return m.group(0)
            # Skip loop iterators, which are handled within loops
            if expr == 'it' or expr.startswith('it.'):
                return m.group(0)
            val = resolve_any_path(expr, data)
            if isinstance(val, (str, int, float, bool)):
                return str(val)
            # Not a variable: leave TeX maths ($x$, $a_1$) and prices ($5-$10) in node text alone.
            # Names used in the template, paths and node references are still treated as
            # unresolved variables.
            known = (options or {}).get('knownNames') or set()
            first = expr.split('.', 1)[0]
            looks_like_reference = '.' in expr or first.startswith('node-') or first in data or first in known
            if not looks_like_reference or not (expr[0].isalpha() or expr[0] == '_'):
                return m.group(0)
            return f"<!-- unresolved: {expr} -->" if options and options.get('showUnresolvedMarkers') else ''
        processed_content = token_pat.sub(replace_token, processed_content)

        # Safety: strip any leftover $for(nodes.vars)$ blocks (should have been expanded/removed earlier)
        try:
            processed_content = re.sub(r"\$for\(nodes\.vars\)\$(.*?)\$endfor\$", '', processed_content, flags=re.DOTALL)
        except Exception:
            pass

        # Optionally reprocess $for(nodes)$ blocks using current data['nodes']
        reprocess_nodes = True if options is None else bool(options.get('reprocessNodesInPasses', True))
        if reprocess_nodes and isinstance(data.get('nodes'), list):
            prev = None
            while prev != processed_content:
                prev = processed_content
                processed_content = self._process_nodes_array(processed_content, data['nodes'])

        # Do not strip control tokens here; that should be done after all passes
        return processed_content
    
    def _process_nodes_array(self, template: str, nodes: List[Dict[str, Any]]) -> str:
        """Process all $for(nodes)$ ... $endfor$ loops in the template (zero or more occurrences).
        Robust to nested $for(...)$ blocks by scanning and balancing $for/$endfor tokens.
        """
        start_pat = re.compile(r'\$for\(nodes\)\$')
        endfor_pat = re.compile(r'\$endfor\$')
        any_for_pat = re.compile(r'\$for\([^)]*\)\$')
        out_parts: List[str] = []
        idx = 0
        text_len = len(template)
        while True:
            m = start_pat.search(template, idx)
            if not m:
                out_parts.append(template[idx:])
                break

            # Append text before this loop
            out_parts.append(template[idx:m.start()])

            # Find matching $endfor$ with nesting awareness
            pos = m.end()
            depth = 1
            while pos < text_len and depth > 0:
                m_for = any_for_pat.search(template, pos)
                m_end = endfor_pat.search(template, pos)
                if not m_end:
                    # Malformed; bail out and append rest
                    out_parts.append(template[m.start():])
                    return ''.join(out_parts)
                if m_for and m_for.start() < m_end.start():
                    depth += 1
                    pos = m_for.end()
                else:
                    depth -= 1
                    pos = m_end.end()

            loop_block_start = m.start()
            loop_block_end = pos
            loop_content = template[m.end(): m_end.start()] if depth == 0 else template[m.end():pos]

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

                has_vars = isinstance(node.get('vars'), dict) and len(node.get('vars')) > 0
                has_atts = isinstance(node.get('attachments'), list) and len(node.get('attachments')) > 0

                # Node-scoped blocks, nested to any depth (#135): $if(nodes.<path>)$, $ifnot(...)$,
                # $for(nodes.metadata)$, $for(nodes.vars)$, $for(nodes.attachments)$ and loops over
                # any other list or dict on the node. Blocks over document data, and $for(nodes)$
                # (which node content may contain), are left for later passes.
                node_block = _render_blocks(
                    node_block,
                    _item_or(lambda expr, node=node: resolve_node_expr(expr, node)),
                    lambda kind, expr: not expr.startswith('nodes.'),
                )
                if not has_vars:
                    # Remove the exact heading used by default templates if left dangling
                    node_block = re.sub(r"^###\s+Variables\s*$\n?", '', node_block, flags=re.MULTILINE)

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
            idx = loop_block_end

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
            # Check if Pandoc is available (PATH is augmented by Electron main)
            result = subprocess.run(['pandoc', '--version'], capture_output=True, text=True)
            if result.returncode != 0:
                return False, "Pandoc is not installed. Please install Pandoc to use this feature."
            
            # Create temporary markdown file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.md', 
                                           delete=False, encoding='utf-8') as temp_file:
                temp_file.write(markdown_content)
                temp_file_path = temp_file.name
            pdf_support_files: List[str] = []
            
            try:
                # Ensure temp_file_path is absolute for cross-platform compatibility
                temp_file_path = os.path.abspath(temp_file_path)
                
                # Build pandoc command
                cmd = [
                    'pandoc',
                    temp_file_path,
                    '-o', output_file,
                    '-f', 'markdown+tex_math_dollars+tex_math_single_backslash'
                ]
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
                    # Wrap long code-block lines and inline code spans instead of
                    # letting them overflow the page (#42)
                    header_file_path = _write_temp_file(PDF_CODE_WRAP_HEADER, '.tex')
                    pdf_support_files.append(header_file_path)
                    cmd.append(f'--include-in-header={header_file_path}')
                    filter_file_path = _write_temp_file(PDF_INLINE_CODE_WRAP_FILTER, '.lua')
                    pdf_support_files.append(filter_file_path)
                    cmd.append(f'--lua-filter={filter_file_path}')
                    # Prefer tectonic if available on PATH (bundled or system), otherwise xelatex/pdflatex
                    try:
                        tect = subprocess.run(['tectonic', '--version'], capture_output=True, text=True)
                        if tect.returncode == 0:
                            cmd.extend(['--pdf-engine=tectonic'])
                        else:
                            cmd.extend(['--pdf-engine=xelatex'])
                    except Exception:
                        cmd.extend(['--pdf-engine=xelatex'])
                elif output_format == 'html':
                    cmd.extend(['--standalone', '--self-contained', '--mathml'])
                elif output_format == 'docx':
                    # Basic DOCX export without reference template
                    pass
                elif output_format == 'epub':
                    # EPUB benefits from MathML for math rendering
                    cmd.extend(['--mathml'])
                elif output_format == 'odt':
                    # OpenDocument Text format
                    pass
                
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
                    
                    if output_format == 'pdf' and ("xelatex" in error_msg or "tectonic" in error_msg):
                        # Try with pdflatex as fallback, keeping all other options
                        cmd = [a for a in cmd if not a.startswith('--pdf-engine=')]
                        cmd.append('--pdf-engine=pdflatex')
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
                # Clean up temporary files
                for path in [temp_file_path, *pdf_support_files]:
                    try:
                        if path and os.path.exists(path):
                            os.unlink(path)
                    except Exception as e:
                        logger.warning(f"Failed to clean up temporary file {path}: {e}")
                
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