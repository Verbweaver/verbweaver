"""
Compiler endpoints
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import io
import os
import re
import yaml
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.core.security import get_current_user
from app.services.git_service import GitService
from app.services.template_service import TemplateService

router = APIRouter()

class CompileRequest(BaseModel):
    nodes: List[str]
    format: str
    template: Optional[str] = None
    custom_variables: Optional[Dict[str, Any]] = None
    node_variables: Optional[Dict[str, Dict[str, Any]]] = None
    options: Dict[str, Any]

class CompileResponse(BaseModel):
    success: bool
    message: str
    filename: str

class ContentAggregator:
    """Reusable content aggregation logic"""
    
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.template_service = TemplateService(project_path)
    
    def aggregate_content(self, node_paths: List[str], options: Dict[str, Any], 
                        template_path: Optional[str] = None, 
                        custom_variables: Optional[Dict[str, Any]] = None,
                        node_variables: Optional[Dict[str, Dict[str, Any]]] = None) -> str:
        """Aggregate content from multiple nodes into a single document"""
        
        # If template is specified, use template-based processing
        if template_path:
            return self._process_with_template(node_paths, options, template_path, custom_variables, node_variables)
        
        # Find default template for the format
        format_type = options.get('format', 'pdf')
        default_template_path = self._find_default_template(format_type)
        
        if not default_template_path:
            raise ValueError(f"No default template found for format: {format_type}. Please select a template or create one.")
        
        return self._process_with_template(node_paths, options, default_template_path, custom_variables, node_variables)
    
    def _process_with_template(self, node_paths: List[str], options: Dict[str, Any],
                             template_path: str, custom_variables: Optional[Dict[str, Any]] = None,
                             node_variables: Optional[Dict[str, Dict[str, Any]]] = None) -> str:
        """Process content using a template"""
        
        # Get template content
        template_content = self.template_service.get_template_content(template_path)
        if not template_content:
            raise ValueError(f"Template not found: {template_path}")
        
        # First, process includes to get the final template content
        # This ensures we extract schema from the actual template that will be used
        final_template_content = self.template_service.process_includes_only(template_content, template_path)
        
        # Validate template and get schema (variables + nodeVariables) from the final template
        is_valid, custom_vars, schema, validation_messages = self.template_service.validate_template(final_template_content)
        if not is_valid:
            raise ValueError(f"Invalid template: {custom_vars}")

        # --- Compute helpers (safe, minimal) ---
        def resolve_path(root: Dict[str, Any], path: str):
            try:
                parts = path.split('.') if path else []
                cur: Any = root
                for p in parts:
                    if isinstance(cur, dict):
                        cur = cur.get(p)
                    elif isinstance(cur, list) and p.endswith(']') and '[' in p:
                        # Not supporting nested index here
                        return None
                    else:
                        return None
                return cur
            except Exception:
                return None

        def expand_list_selector(root: Dict[str, Any], selector: str) -> List[Any]:
            # Supports paths like nodes[*].vars.cvss
            if selector.startswith('nodes[*].'):
                key_path = selector[len('nodes[*].'):]
                values: List[Any] = []
                for n in root.get('nodes', []):
                    values.append(resolve_path(n, key_path))
                return values
            # Fallback single value
            v = resolve_path(root, selector)
            return v if isinstance(v, list) else [v]

        def cvss_base_score(vector: str) -> Optional[float]:
            if not isinstance(vector, str) or '/' not in vector:
                return None
            try:
                # Parse simple CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
                parts = {kv.split(':')[0]: kv.split(':')[1] for kv in vector.split('/') if ':' in kv}
                ver = vector.split('/')[0]
                scope = parts.get('S', 'U')
                AV = {'N':0.85,'A':0.62,'L':0.55,'P':0.2}.get(parts.get('AV','N'),0.85)
                AC = {'L':0.77,'H':0.44}.get(parts.get('AC','L'),0.77)
                UI = {'N':0.85,'R':0.62}.get(parts.get('UI','N'),0.85)
                # PR depends on scope
                pr_map_u = {'N':0.85,'L':0.62,'H':0.27}
                pr_map_c = {'N':0.85,'L':0.68,'H':0.5}
                PR = (pr_map_c if parts.get('S','U')=='C' else pr_map_u).get(parts.get('PR','N'),0.85)
                C = {'N':0.0,'L':0.22,'H':0.56}.get(parts.get('C','N'),0.0)
                I = {'N':0.0,'L':0.22,'H':0.56}.get(parts.get('I','N'),0.0)
                A = {'N':0.0,'L':0.22,'H':0.56}.get(parts.get('A','N'),0.0)
                exploitability = 8.22 * AV * AC * PR * UI
                impact_sub = 1 - (1-C)*(1-I)*(1-A)
                if scope == 'U':
                    impact_score = 6.42 * impact_sub
                else:
                    impact_score = 7.52*(impact_sub - 0.029) - 3.25*((impact_sub - 0.02)**15)
                if impact_score <= 0:
                    base = 0.0
                else:
                    base = min(impact_score + exploitability, 10.0)
                    if scope == 'C':
                        base = min(1.08 * (impact_score + exploitability), 10.0)
                # round up to one decimal as per CVSS (round up, not half-even)
                def round_up(x: float) -> float:
                    return float(f"{((int(x*10 + (0 if x*10 == int(x*10) else 1))) / 10):.1f}") if x>0 else 0.0
                # Simpler: use conventional rounding to one decimal
                return round(base + 1e-7, 1)
            except Exception:
                return None

        def compute_value(defn: Dict[str, Any], context: Dict[str, Any]) -> Any:
            comp = (defn or {}).get('compute')
            if not comp:
                return None
            # Support { fn: 'cvss.baseScore', args: ['${nodes.vars.cvssVector}'] }
            fn = comp.get('fn') if isinstance(comp, dict) else None
            args = comp.get('args', []) if isinstance(comp, dict) else []
            def resolve_arg(a: Any) -> Any:
                if isinstance(a, str) and a.startswith('${') and a.endswith('}'):
                    sel = a[2:-1]
                    if sel.startswith('nodes[*].'):
                        return expand_list_selector(context, sel)
                    return resolve_path(context, sel)
                return a
            rargs = [resolve_arg(a) for a in (args or [])]
            if fn == 'cvss.baseScore':
                return cvss_base_score(rargs[0] if rargs else None)
            if fn == 'cvss.severity':
                val = rargs[0] if rargs else None
                score: Optional[float] = None
                if isinstance(val, (int, float)):
                    score = float(val)
                elif isinstance(val, str):
                    score = cvss_base_score(val)
                if score is None:
                    return None
                if score >= 9.0:
                    return 'Critical'
                if score >= 7.0:
                    return 'High'
                if score >= 4.0:
                    return 'Medium'
                return 'Low'
            if fn in ('math.mean','mean'):
                arr = rargs[0] if rargs else []
                vals = [float(x) for x in (arr or []) if isinstance(x,(int,float)) or (isinstance(x,str) and x.replace('.','',1).isdigit())]
                return round(sum(vals)/len(vals), 3) if vals else None
            if fn in ('math.sum','sum'):
                arr = rargs[0] if rargs else []
                vals = [float(x) for x in (arr or []) if isinstance(x,(int,float)) or (isinstance(x,str) and x.replace('.','',1).isdigit())]
                return round(sum(vals), 3) if vals else None
            if fn in ('math.min','min'):
                arr = rargs[0] if rargs else []
                vals = [float(x) for x in (arr or []) if isinstance(x,(int,float)) or (isinstance(x,str) and x.replace('.','',1).isdigit())]
                return min(vals) if vals else None
            if fn in ('math.max','max'):
                arr = rargs[0] if rargs else []
                vals = [float(x) for x in (arr or []) if isinstance(x,(int,float)) or (isinstance(x,str) and x.replace('.','',1).isdigit())]
                return max(vals) if vals else None
            if fn in ('count',):
                arr = rargs[0] if rargs else []
                return len(arr) if isinstance(arr, list) else (0 if arr is None else 1)
            if fn == 'string.regexMatch':
                try:
                    import re
                    pattern = str(rargs[1]) if len(rargs) > 1 else ''
                    return bool(re.search(pattern, str(rargs[0] or '')))
                except Exception:
                    return None
            if fn == 'date.now':
                from datetime import datetime
                return datetime.utcnow().isoformat()
            if fn == 'date.today':
                from datetime import date
                return date.today().isoformat()
            if fn in ('math.round','round'):
                try:
                    num = float(rargs[0]) if rargs else None
                    decimals = int(rargs[1]) if len(rargs) > 1 else 0
                    return round(num, decimals) if num is not None else None
                except Exception:
                    return None
            if fn == 'string.upper':
                return str(rargs[0]).upper() if rargs else None
            if fn == 'string.lower':
                return str(rargs[0]).lower() if rargs else None
            return None
        
        # Prepare data for template
        data = {
            'title': options.get('title', 'Document'),
            'author': options.get('author', 'Unknown'),
            'date': options.get('date', ''),
            # Support both includeTOC and includeToc from clients
            'toc': bool(options.get('includeTOC') or options.get('includeToc')),
            'includeMetadata': bool(options.get('includeMetadata', True)),
            'nodes': []
        }
        
        # Add custom variables
        if custom_variables:
            data.update(custom_variables)
        
        # Process each selected node
        id_to_node: Dict[str, Dict[str, Any]] = {}
        for path in node_paths:
            try:
                full_path = os.path.normpath(os.path.join(self.project_path, path))
                if os.path.exists(full_path):
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Extract metadata first so we can prefer frontmatter title
                    metadata = self._extract_metadata(content)

                    # Determine display title with sensible precedence:
                    # 1) explicit frontmatter title
                    # 2) first H1 heading that is not a template placeholder (e.g. "$title$")
                    # 3) filename stem
                    fm_title = None
                    try:
                        if isinstance(metadata, dict):
                            fm_title = metadata.get('title')
                    except Exception:
                        fm_title = None

                    extracted_title = self._extract_title(content)
                    title = (fm_title or extracted_title or os.path.basename(path).replace('.md', ''))

                    # Prepare content (optionally include metadata rendering)
                    clean_content = self._clean_content(content, options.get('includeMetadata', True))
                    
                    # Get attachments
                    attachments = []
                    if options.get('embedUploadedFiles', True):
                        attachments = self._get_attachments(content, path)
                        # Process image embeddings in content
                        clean_content = self._process_image_embeddings(clean_content, path, attachments)
                    
                    node_id = None
                    try:
                        node_id = (metadata or {}).get('id')
                    except Exception:
                        node_id = None

                    node_data = {
                        'title': title,
                        'content': clean_content,
                        'metadata': metadata,
                        'attachments': attachments,
                        'path': path
                    }
                    if node_id:
                        node_data['id'] = node_id

                    # Resolve node-scoped variables: prefer compile-time overrides, fall back to metadata via schema path
                    resolved_vars: Dict[str, Any] = {}
                    try:
                        node_schema = (schema or {}).get('nodeVariables', {})
                        if isinstance(node_schema, dict):
                            for var_name, var_def in node_schema.items():
                                # override from request
                                if node_variables and path in node_variables and var_name in (node_variables[path] or {}):
                                    resolved_vars[var_name] = node_variables[path][var_name]
                                    continue
                                # fallback from metadata via dotted path
                                path_expr = (var_def or {}).get('path')
                                if path_expr and isinstance(metadata, dict):
                                    # Allow paths beginning with 'metadata.' as declared in docs
                                    expr = str(path_expr)
                                    if expr.startswith('metadata.'):
                                        expr = expr[len('metadata.'):]
                                    cur = metadata
                                    for part in expr.split('.') if expr else []:
                                        if isinstance(cur, dict) and part in cur:
                                            cur = cur[part]
                                        else:
                                            cur = None
                                            break
                                    if cur is not None:
                                        resolved_vars[var_name] = cur
                    except Exception:
                        pass

                    # Apply computed nodeVariables if defined and not explicitly overridden
                    node_schema = (schema or {}).get('nodeVariables', {}) if isinstance(schema, dict) else {}
                    if isinstance(node_schema, dict):
                        for var_name, var_def in node_schema.items():
                            if (resolved_vars.get(var_name) in (None, '')) and var_def and isinstance(var_def, dict) and var_def.get('compute'):
                                val = compute_value(var_def, { 'nodes': [], **node_data })
                                if val is not None:
                                    resolved_vars[var_name] = val

                    # Apply defaults for boolean/primitive nodeVariables when declared with 'default'
                    try:
                        if isinstance(node_schema, dict):
                            for var_name, var_def in node_schema.items():
                                if var_name not in resolved_vars and isinstance(var_def, dict) and 'default' in var_def:
                                    resolved_vars[var_name] = var_def.get('default')
                    except Exception:
                        pass

                    if resolved_vars:
                        node_data['vars'] = resolved_vars
                    
                    data['nodes'].append(node_data)
                    if node_id and isinstance(node_id, str):
                        id_to_node[node_id] = node_data
                else:
                    # If the file path doesn't exist, add a visible placeholder node instead of silently skipping.
                    try:
                        data['nodes'].append({
                            'title': os.path.basename(path).replace('.md', ''),
                            'content': f"*File not found: {path}*",
                            'metadata': {},
                            'attachments': [],
                            'path': path
                        })
                    except Exception:
                        pass
                    
            except Exception as e:
                # Add error node
                data['nodes'].append({
                    'title': os.path.basename(path),
                    'content': f"*Error loading file: {str(e)}*",
                    'metadata': {},
                    'attachments': [],
                    'path': path
                })
        
        # Compute document-scope variables if schema defines them
        try:
            doc_vars = {}
            vars_schema = (schema or {}).get('variables', {}) if isinstance(schema, dict) else {}
            if isinstance(vars_schema, dict):
                for var_name, var_def in vars_schema.items():
                    if isinstance(var_def, dict) and var_def.get('compute'):
                        # Do not override explicit user-provided values
                        if var_name in data and data.get(var_name) not in (None, ''):
                            continue
                        val = compute_value(var_def, data)
                        if val is not None:
                            doc_vars[var_name] = val
            if doc_vars:
                data.update(doc_vars)
        except Exception:
            pass

        # Precompute helpers for table-type document variables (provide both nested and top-level helpers)
        try:
            vars_schema = (schema or {}).get('variables', {}) if isinstance(schema, dict) else {}
            if isinstance(vars_schema, dict):
                for var_name, var_def in vars_schema.items():
                    try:
                        if not (isinstance(var_def, dict) and var_def.get('type') == 'table'):
                            continue
                        # Ensure a value exists in data for this table var
                        value = data.get(var_name)
                        # Initialize from defaults if missing or invalid
                        if not isinstance(value, dict):
                            value = {}
                        columns = value.get('columns')
                        if not (isinstance(columns, list) and all(isinstance(c, str) for c in columns)):
                            columns = list(var_def.get('columnsDefault') or ['Task'])
                        types = value.get('types')
                        if not isinstance(types, dict):
                            types = {}
                        rows = value.get('rows')
                        if not (isinstance(rows, list) and all(isinstance(r, dict) for r in rows)):
                            rows = []

                        # Sanitize columns (unique, non-empty strings)
                        clean_cols = []
                        seen = set()
                        for c in columns:
                            cn = str(c).strip()
                            if not cn or cn in seen:
                                continue
                            clean_cols.append(cn)
                            seen.add(cn)
                        if not clean_cols:
                            clean_cols = ['Task']

                        # Build header separator (simple Markdown style)
                        header_sep = '|' + '|'.join(['---' for _ in clean_cols]) + '|'

                        # Build row lines and cells aligned to columns
                        def _format_cell(x: Any) -> str:
                            if x is None:
                                return ''
                            if isinstance(x, bool):
                                return 'true' if x else 'false'
                            return str(x)

                        rendered_rows = []
                        for r in rows:
                            cells = [_format_cell(r.get(col, '')) for col in clean_cols]
                            line = '| ' + ' | '.join(cells) + ' |'
                            # augment row dict with helper keys without losing original keys
                            rr = dict(r)
                            rr['cells'] = cells
                            rr['line'] = line
                            rendered_rows.append(rr)

                        # Full markdown helper (A)
                        header_line = '| ' + ' | '.join(clean_cols) + ' |'
                        table_md = header_line + '\n' + header_sep
                        if rendered_rows:
                            table_md += '\n' + '\n'.join([rr['line'] for rr in rendered_rows])

                        # Write nested helpers under data[var_name]
                        try:
                            nested = data.get(var_name)
                            if not isinstance(nested, dict):
                                nested = {}
                            nested['columns'] = clean_cols
                            nested['types'] = types if isinstance(types, dict) else {}
                            nested['rows'] = rendered_rows
                            nested['headerSeparator'] = header_sep
                            nested['headerLine'] = header_line
                            nested['markdown'] = table_md
                            data[var_name] = nested
                        except Exception:
                            pass

                        # Also expose top-level convenience variables (B)
                        data[f"{var_name}_columns"] = clean_cols
                        data[f"{var_name}_headerSeparator"] = header_sep
                        data[f"{var_name}_headerLine"] = header_line
                        data[f"{var_name}_rows"] = rendered_rows
                        data[f"{var_name}_markdown"] = table_md
                    except Exception:
                        continue
        except Exception:
            pass

        # Expose nodesById map and top-level aliases for node-<ID>
        if id_to_node:
            try:
                data['nodesById'] = dict(id_to_node)
                for nid, nobj in id_to_node.items():
                    data[str(nid)] = nobj
            except Exception:
                pass

        # First-pass full template processing (includes + all normal rules)
        rendered = self.template_service.process_template(template_content, data, template_path)

        # Multi-pass inline evaluation to support variables/logic inside node bodies and referenced nodes
        max_passes = int(options.get('maxVariablePasses', 5) or 5)
        reprocess_nodes = bool(options.get('reprocessNodesInPasses', True))
        show_markers = bool(options.get('showUnresolvedMarkers', False))

        # Helper to detect referenced node IDs within text
        def _detect_referenced_node_ids(text: str) -> List[str]:
            try:
                import re as _re
                ids = set(_re.findall(r"node-[A-Za-z0-9_\-]+", text))
                return [i for i in ids]
            except Exception:
                return []

        # Helper to find a node file by metadata.id and build node_data
        def _load_node_by_id(node_id: str) -> Optional[Dict[str, Any]]:
            try:
                # Prefer scanning the standard 'nodes' directory for performance
                base_dirs = []
                nd = os.path.join(self.project_path, 'nodes')
                if os.path.isdir(nd):
                    base_dirs.append(nd)
                else:
                    base_dirs.append(self.project_path)

                for base in base_dirs:
                    for root_dir, _dirs, files in os.walk(base):
                        for fname in files:
                            if not fname.lower().endswith('.md'):
                                continue
                            fpath = os.path.join(root_dir, fname)
                            try:
                                with open(fpath, 'r', encoding='utf-8') as fp:
                                    raw = fp.read()
                                meta = self._extract_metadata(raw)
                                if isinstance(meta, dict) and meta.get('id') == node_id:
                                    rel_path = os.path.relpath(fpath, self.project_path).replace('\\', '/')
                                    # Build node_data equivalent to selected nodes
                                    fm_title = None
                                    try:
                                        fm_title = meta.get('title') if isinstance(meta, dict) else None
                                    except Exception:
                                        fm_title = None
                                    extracted_title = self._extract_title(raw)
                                    title = (fm_title or extracted_title or os.path.basename(rel_path).replace('.md',''))
                                    clean_content = self._clean_content(raw, options.get('includeMetadata', True))
                                    attachments = []
                                    if options.get('embedUploadedFiles', True):
                                        attachments = self._get_attachments(raw, rel_path)
                                        clean_content = self._process_image_embeddings(clean_content, rel_path, attachments)
                                    node_obj: Dict[str, Any] = {
                                        'id': node_id,
                                        'title': title,
                                        'content': clean_content,
                                        'metadata': meta,
                                        'attachments': attachments,
                                        'path': rel_path
                                    }
                                    # Resolve nodeVariables per schema
                                    try:
                                        resolved_vars: Dict[str, Any] = {}
                                        node_schema = (schema or {}).get('nodeVariables', {})
                                        if isinstance(node_schema, dict):
                                            for var_name, var_def in node_schema.items():
                                                # no compile-time overrides for referenced nodes; use metadata path
                                                path_expr = (var_def or {}).get('path')
                                                if path_expr and isinstance(meta, dict):
                                                    expr = str(path_expr)
                                                    if expr.startswith('metadata.'):
                                                        expr = expr[len('metadata.'):]
                                                    cur = meta
                                                    for part in expr.split('.') if expr else []:
                                                        if isinstance(cur, dict) and part in cur:
                                                            cur = cur[part]
                                                        else:
                                                            cur = None
                                                            break
                                                    if cur is not None:
                                                        resolved_vars[var_name] = cur
                                        # computed
                                        node_schema = (schema or {}).get('nodeVariables', {}) if isinstance(schema, dict) else {}
                                        if isinstance(node_schema, dict):
                                            for var_name, var_def in node_schema.items():
                                                if (resolved_vars.get(var_name) in (None, '')) and var_def and isinstance(var_def, dict) and var_def.get('compute'):
                                                    val = compute_value(var_def, { 'nodes': [], **node_obj })
                                                    if val is not None:
                                                        resolved_vars[var_name] = val
                                        if resolved_vars:
                                            node_obj['vars'] = resolved_vars
                                    except Exception:
                                        pass
                                    return node_obj
                            except Exception:
                                continue
                return None
            except Exception:
                return None

        # Iterative passes
        passes_applied = 0
        while passes_applied < max_passes:
            passes_applied += 1
            before = rendered

            # Expand scope with any newly referenced nodes
            for ref_id in _detect_referenced_node_ids(rendered):
                if ref_id in id_to_node:
                    continue
                node_obj = _load_node_by_id(ref_id)
                if node_obj:
                    id_to_node[ref_id] = node_obj
                    try:
                        # update data maps and aliases
                        if 'nodesById' not in data or not isinstance(data.get('nodesById'), dict):
                            data['nodesById'] = {}
                        data['nodesById'][ref_id] = node_obj
                        data[str(ref_id)] = node_obj
                    except Exception:
                        pass

            # Evaluate inline, optionally reprocessing $for(nodes)$ using the current nodes array
            rendered = self.template_service.evaluate_inline(
                rendered,
                data,
                {
                    'reprocessNodesInPasses': reprocess_nodes,
                    'showUnresolvedMarkers': show_markers
                }
            )

            if rendered == before:
                break

        # Final cleanup of any leftover control tokens
        try:
            import re as _re
            rendered = _re.sub(r"\$if\([^)]+\)\$", '', rendered)
            rendered = _re.sub(r"\$ifnot\([^)]+\)\$", '', rendered)
            rendered = rendered.replace('$endif$', '')
        except Exception:
            pass

        return rendered
    
    def _find_default_template(self, format_type: str) -> Optional[str]:
        """Find the default template for a format type"""
        # Get available templates for this format
        available_templates = self.template_service.get_available_templates(format_type)
        
        if not available_templates:
            return None
        
        # Priority order for default template:
        # 1. Project default (from settings)
        # 2. "simple" template
        # 3. First template in the list
        
        # Check for project default template
        project_default = self._get_project_default_template(format_type)
        if project_default:
            # Verify the project default still exists
            if any(t['path'] == project_default for t in available_templates):
                return project_default
        
        # Check for "simple" template
        simple_template = next((t['path'] for t in available_templates if t['name'] == 'simple'), None)
        if simple_template:
            return simple_template
        
        # Use the first template in the list
        return available_templates[0]['path']
    
    def _get_project_default_template(self, format_type: str) -> Optional[str]:
        """Get the project's default template for a format type"""
        try:
            # Read project settings from the git repository
            settings_file = os.path.normpath(os.path.join(self.project_path, 'verbweaver-settings.yaml'))
            if os.path.exists(settings_file):
                import yaml
                with open(settings_file, 'r', encoding='utf-8') as f:
                    settings = yaml.safe_load(f)
                
                # Check for compiler settings
                compiler_settings = settings.get('compiler', {})
                default_templates = compiler_settings.get('defaultTemplates', {})
                return default_templates.get(format_type)
        except Exception as e:
            print(f"Error reading project settings: {e}")
        
        return None
    

    
    def _extract_title(self, content: str) -> Optional[str]:
        """Extract title from markdown content"""
        lines = content.split('\n')
        for line in lines:
            if line.startswith('# '):
                heading_text = line[2:].strip()
                # Ignore common placeholder headings like "$title$" or "$nodes.*$"
                try:
                    import re as _re
                    if _re.fullmatch(r"\$[A-Za-z_][A-Za-z0-9_\.]*\$", heading_text):
                        # Placeholder, not a real title
                        return None
                except Exception:
                    pass
                return heading_text
        return None
    
    def _clean_content(self, content: str, include_metadata: bool = True) -> str:
        """Clean content by removing the first header if it exists and formatting metadata"""
        lines = content.split('\n')
        cleaned_lines = []
        skip_first_header = True
        in_front_matter = False
        front_matter_lines = []
        
        for line in lines:
            # Handle front matter
            if line.strip() == '---':
                if not in_front_matter:
                    in_front_matter = True
                    front_matter_lines = []
                else:
                    # End of front matter
                    in_front_matter = False
                    # Format the front matter nicely only if metadata should be included
                    if front_matter_lines and include_metadata:
                        cleaned_lines.append("### Metadata")
                        cleaned_lines.append("")
                        cleaned_lines.append("```yaml")
                        cleaned_lines.extend(front_matter_lines)
                        cleaned_lines.append("```")
                        cleaned_lines.append("")
                    continue
            
            if in_front_matter:
                front_matter_lines.append(line)
                continue
            
            # Skip the first header if it exists
            if skip_first_header and line.startswith('# '):
                skip_first_header = False
                continue
            
            cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines).strip()
    
    def _add_embedded_files(self, content: str, node_path: str, include_metadata: bool = True) -> Optional[str]:
        """Add embedded files section if task has uploaded files"""
        try:
            # Parse front matter to get task metadata
            
            # Extract YAML front matter
            yaml_match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if not yaml_match:
                return None
            
            yaml_content = yaml_match.group(1)
            metadata = yaml.safe_load(yaml_content) if yaml_content else {}
            
            # Check for task metadata and files
            task_metadata = metadata.get('task', {})
            files = task_metadata.get('files', [])
            
            if not files:
                return None
            
            # Filter out empty or invalid file entries
            valid_files = []
            for file_info in files:
                if file_info and isinstance(file_info, dict):
                    file_name = file_info.get('originalName') or file_info.get('name')
                    if file_name and file_name.strip():  # Only include files with valid names
                        valid_files.append(file_info)
            
            if not valid_files:
                return None
            
            # Create embedded files section only if metadata should be included
            if not include_metadata:
                return None
                
            sections = []
            sections.append("### Attachments\n\n")
            
            for file_info in valid_files:
                file_name = file_info.get('originalName') or file_info.get('name', 'Unknown File')
                file_size = file_info.get('size', 0)
                uploaded_at = file_info.get('uploadedAt', '')
                
                # Format file size
                size_str = self._format_file_size(file_size)
                
                # Create the attachment line
                attachment_line = f"- **{file_name}** ({size_str})"
                if uploaded_at:
                    # Format the date nicely
                    try:
                        from datetime import datetime
                        dt = datetime.fromisoformat(uploaded_at.replace('Z', '+00:00'))
                        formatted_date = dt.strftime('%Y-%m-%d %H:%M')
                        attachment_line += f" - Uploaded: {formatted_date}"
                    except:
                        attachment_line += f" - Uploaded: {uploaded_at}"
                
                sections.append(attachment_line)
                sections.append("")  # Add empty line between list items
            
            # Remove the last empty line if we have attachments
            if valid_files and sections[-1] == "":
                sections.pop()
            
            return '\n'.join(sections)
            
        except Exception as e:
            print(f"Error processing embedded files for {node_path}: {e}")
            return None
    
    def _format_file_size(self, bytes: int) -> str:
        """Format file size in human readable format"""
        if bytes == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB"]
        i = 0
        while bytes >= 1024 and i < len(size_names) - 1:
            bytes /= 1024.0
            i += 1
        
        return f"{bytes:.1f} {size_names[i]}"
    
    def _extract_metadata(self, content: str) -> Dict[str, Any]:
        """Extract metadata from markdown content"""
        try:
            # Extract YAML front matter
            yaml_match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if yaml_match:
                yaml_content = yaml_match.group(1)
                return yaml.safe_load(yaml_content) if yaml_content else {}
        except Exception as e:
            print(f"Error extracting metadata: {e}")
        return {}
    
    def _get_attachments(self, content: str, node_path: str) -> List[Dict[str, Any]]:
        """Get attachments from node content"""
        try:
            # Extract YAML front matter
            yaml_match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
            if not yaml_match:
                return []
            
            yaml_content = yaml_match.group(1)
            metadata = yaml.safe_load(yaml_content) if yaml_content else {}
            
            # Check for task metadata and files
            task_metadata = metadata.get('task', {})
            files = task_metadata.get('files', [])
            
            if not files:
                return []
            
            # Filter out empty or invalid file entries
            valid_files = []
            for file_info in files:
                if file_info and isinstance(file_info, dict):
                    file_name = file_info.get('originalName') or file_info.get('name')
                    if file_name and file_name.strip():
                        valid_files.append({
                            'name': file_name,
                            'size': self._format_file_size(file_info.get('size', 0)),
                            'uploadedAt': file_info.get('uploadedAt', ''),
                            'path': file_info.get('path', ''),  # Add file path for image embedding
                            'mimeType': file_info.get('mimeType', '')
                        })
            
            return valid_files
            
        except Exception as e:
            print(f"Error processing attachments for {node_path}: {e}")
            return []

    def _process_image_embeddings(self, content: str, node_path: str, attachments: List[Dict[str, Any]]) -> str:
        """Process image embeddings in content and add image references for attachments"""
        import os
        
        # Get the directory of the current node for relative path resolution
        node_dir = os.path.dirname(os.path.normpath(os.path.join(self.project_path, node_path)))
        
        # Process existing image references to ensure they're relative to project root
        def fix_image_paths(match):
            img_path = match.group(2)
            alt_text = match.group(1)
            title = match.group(3) if match.group(3) else ""
            
            # If it's already an absolute path or URL, leave it as is
            if img_path.startswith(('http://', 'https://', '/')):
                return match.group(0)
            
            # Make path relative to project root
            full_img_path = os.path.normpath(os.path.join(node_dir, img_path))
            if os.path.exists(full_img_path):
                # Convert to relative path from project root
                rel_path = os.path.relpath(full_img_path, self.project_path)
                return f"![{alt_text}]({rel_path}{title})"
            
            return match.group(0)
        
        # Fix existing image references
        import re
        content = re.sub(r'!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)', fix_image_paths, content)
        
        # Add image references for image attachments
        image_attachments = [att for att in attachments if att.get('mimeType', '').startswith('image/')]
        
        if image_attachments:
            # Add a section for embedded images if not already present
            if "### Attachments" not in content:
                content += "\n\n### Attachments\n\n"
            
            for attachment in image_attachments:
                file_name = attachment.get('name', 'Unknown')
                file_path = attachment.get('path', '')
                
                if file_path and os.path.exists(file_path):
                    # Make path relative to project root
                    rel_path = os.path.relpath(file_path, self.project_path)
                    # Add image reference
                    content += f"\n![{file_name}]({rel_path})\n"
        
        return content




class PandocExporter:
    """Pandoc-based exporter for multiple formats"""
    
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.template_service = TemplateService(project_path)
    
    def export(self, content: str, options: Dict[str, Any], output_format: str) -> bytes:
        """Export content using Pandoc"""
        import tempfile
        import os
        
        print(f"PandocExporter: Starting export to {output_format}")
        print(f"PandocExporter: Content length: {len(content)} characters")
        
        # Create temporary output file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{output_format}') as temp_output:
            output_file = temp_output.name
        
        # Ensure output file path is absolute for cross-platform compatibility
        output_file = os.path.abspath(output_file)
        print(f"PandocExporter: Output file: {output_file}")
        
        try:
            # Convert using Pandoc with proper working directory
            success, message = self.template_service.convert_with_pandoc(
                content, output_format, output_file, self.project_path, options
            )
            
            print(f"PandocExporter: Conversion result - Success: {success}, Message: {message}")
            
            if not success:
                raise ValueError(f"Pandoc conversion failed: {message}")
            
            # Read the converted file
            with open(output_file, 'rb') as f:
                result = f.read()
                print(f"PandocExporter: Generated file size: {len(result)} bytes")
                return result
                
        finally:
            # Clean up temporary file
            try:
                if os.path.exists(output_file):
                    os.unlink(output_file)
            except Exception as e:
                print(f"PandocExporter: Failed to clean up output file {output_file}: {e}")

class ExporterFactory:
    """Factory for creating exporters based on format"""
    
    @staticmethod
    def create_exporter(format_type: str, project_path: str = None):
        # Use Pandoc for all formats
        pandoc_formats = ['pdf', 'docx', 'epub', 'odt', 'markdown', 'html']
        if format_type in pandoc_formats:
            if not project_path:
                raise ValueError(f"Project path required for {format_type} export")
            return PandocExporter(project_path)
        
        raise ValueError(f"Unsupported format: {format_type}")

@router.post("/{project_id}/compile")
async def compile_document(
    project_id: str,
    request: CompileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Compile selected nodes into a document"""
    
    try:
        print(f"Compiling document for project {project_id}")
        print(f"Request nodes: {request.nodes}")
        print(f"Request format: {request.format}")
        print(f"Request options: {request.options}")
        
        # Check project access
        result = await db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.user_id == current_user.id
            )
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        
        print(f"Found project: {project.name}")
        print(f"Project git_config: {project.git_config}")
        
        # Get project path
        project_path = project.git_config.get('path')
        
        if not project_path:
            raise HTTPException(status_code=404, detail="Project path not configured")
        
        # Ensure project path is absolute and normalized for cross-platform compatibility
        project_path = os.path.abspath(os.path.normpath(project_path))
        print(f"Project path: {project_path}")
        
        # Validate project path exists
        if not os.path.exists(project_path):
            raise HTTPException(status_code=404, detail="Project directory not found")
        
        # Create content aggregator
        aggregator = ContentAggregator(project_path)
        
        # Aggregate content
        print("Aggregating content...")
        print(f"Template: {request.template}")
        print(f"Custom variables: {request.custom_variables}")
        content = aggregator.aggregate_content(
            request.nodes, 
            request.options,
            request.template,
            request.custom_variables,
            request.node_variables
        )
        print(f"Content length: {len(content)} characters")
        
        # Create exporter
        print(f"Creating exporter for format: {request.format}")
        exporter = ExporterFactory.create_exporter(request.format, project_path)
        
        # Export content
        print("Exporting content...")
        if isinstance(exporter, PandocExporter):
            # Pandoc exporter needs format parameter
            exported_content = exporter.export(content, request.options, request.format)
        else:
            # Standard exporters (Markdown, HTML)
            exported_content = exporter.export(content, request.options)
        
        # Generate filename
        title = request.options.get('title', 'document')
        filename = f"{title}.{request.format}"
        
        print(f"Generated filename: {filename}")
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(exported_content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ValueError as e:
        print(f"ValueError in compile_document: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Exception in compile_document: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Compilation failed: {str(e)}")

@router.get("/formats")
async def get_supported_formats():
    """Get list of supported export formats"""
    return {
        "formats": [
            {"id": "markdown", "name": "Markdown", "description": "Plain text with formatting"},
            {"id": "html", "name": "HTML", "description": "Web page format"},
            {"id": "pdf", "name": "PDF", "description": "Portable Document Format"},
            {"id": "docx", "name": "Word Document", "description": "Microsoft Word format"},
            {"id": "odt", "name": "OpenDocument", "description": "Open Document Text"},
            {"id": "epub", "name": "EPUB", "description": "Electronic publication"},
            {"id": "mobi", "name": "MOBI", "description": "Kindle format"},
        ]
    }

@router.get("/{project_id}/templates")
async def get_templates(
    project_id: str,
    format_type: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get available templates for a project"""
    
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Get project path
    project_path = project.git_config.get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    
    # Ensure project path is absolute and normalized for cross-platform compatibility
    project_path = os.path.abspath(os.path.normpath(project_path))
    print(f"Getting templates for project: {project_path}")
    
    # Create template service
    template_service = TemplateService(project_path)
    
    if format_type:
        # Get templates for specific format
        print(f"Getting templates for format: {format_type}")
        templates = template_service.get_available_templates(format_type)
    else:
        # Get templates for all formats
        print("Getting templates for all formats")
        templates = []
        for fmt in template_service.supported_formats:
            templates.extend(template_service.get_available_templates(fmt))
    
    print(f"Found {len(templates)} templates")
    return {"templates": templates}

@router.get("/{project_id}/templates/{template_path:path}")
async def get_template_content(
    project_id: str,
    template_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get template content and validate it"""
    
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Get project path
    project_path = project.git_config.get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    
    # Ensure project path is absolute and normalized for cross-platform compatibility
    project_path = os.path.abspath(os.path.normpath(project_path))
    print(f"Getting template content for project: {project_path}")
    print(f"Template path: {template_path}")
    
    # Create template service
    template_service = TemplateService(project_path)
    
    # Get template content
    content = template_service.get_template_content(template_path)
    if not content:
        print(f"Template not found: {template_path}")
        raise HTTPException(status_code=404, detail="Template not found")
    
    print(f"Successfully loaded template: {template_path}")
    
    # Process includes to get the final template content for schema extraction
    # This ensures custom variables are extracted from the actual template that will be used
    final_content = template_service.process_includes_only(content, template_path)
    
    # Validate template and extract schema from the fully resolved template
    is_valid, custom_variables, schema, validation_messages = template_service.validate_template(final_content)
    
    return {
        "content": content,
        "is_valid": is_valid,
        "custom_variables": custom_variables,
        "schema": schema,
        "messages": validation_messages
    } 