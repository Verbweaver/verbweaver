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
from app.core.security import get_current_user, get_current_active_superuser
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
        """Process content using a template with enhanced Linux compatibility"""
        
        # Get template content
        template_content = self.template_service.get_template_content(template_path)
        if not template_content:
            # Enhanced error message for Linux debugging
            error_msg = f"Template not found: {template_path}"
            if os.name == 'posix':
                # Check if template directory exists
                template_dir = os.path.join(self.project_path, "templates", "compiler")
                if not os.path.exists(template_dir):
                    error_msg += f" (Template directory does not exist: {template_dir})"
                else:
                    # List available templates for debugging
                    try:
                        available_templates = os.listdir(template_dir)
                        error_msg += f" (Available templates: {available_templates})"
                    except Exception as e:
                        error_msg += f" (Cannot list templates: {e})"
            raise ValueError(error_msg)
        
        # First, process includes to get the final template content
        # This ensures we extract schema from the actual template that will be used
        final_template_content = self.template_service.process_includes_only(template_content, template_path)
        
        # Validate template and get schema (variables + nodeVariables) from the final template
        is_valid, custom_vars, schema, validation_messages = self.template_service.validate_template(final_template_content)
        if not is_valid:
            raise ValueError(f"Invalid template: {validation_messages}")

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
        
        # Process each node
        for path in node_paths:
            try:
                full_path = os.path.normpath(os.path.join(self.project_path, path))
                if os.path.exists(full_path):
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Extract metadata and content
                    title = self._extract_title(content) or os.path.basename(path).replace('.md', '')
                    clean_content = self._clean_content(content, options.get('includeMetadata', True))
                    
                    # Get node metadata
                    metadata = self._extract_metadata(content)
                    
                    # Get attachments
                    attachments = []
                    if options.get('embedUploadedFiles', True):
                        attachments = self._get_attachments(content, path)
                        # Process image embeddings in content
                        clean_content = self._process_image_embeddings(clean_content, path, attachments)
                    
                    node_data = {
                        'title': title,
                        'content': clean_content,
                        'metadata': metadata,
                        'attachments': attachments,
                        'path': path
                    }

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
                                    cur = metadata
                                    for part in str(path_expr).split('.'):
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

                    if resolved_vars:
                        node_data['vars'] = resolved_vars
                    
                    data['nodes'].append(node_data)
                    
            except Exception as e:
                # Enhanced error handling for Linux debugging
                error_msg = f"Error loading file: {str(e)}"
                if os.name == 'posix':
                    error_msg += f" (Path: {path}, Full path: {os.path.normpath(os.path.join(self.project_path, path))})"
                # Add error node
                data['nodes'].append({
                    'title': os.path.basename(path),
                    'content': f"*{error_msg}*",
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

        # Process template with data (use original template_content, not final_template_content)
        # The includes will be processed again during the full template processing
        return self.template_service.process_template(template_content, data, template_path)
    
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
                return line[2:].strip()
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
        """Export content using Pandoc with Linux compatibility"""
        import tempfile
        import os
        
        print(f"PandocExporter: Starting export to {output_format}")
        print(f"PandocExporter: Content length: {len(content)} characters")
        
        # Platform-specific temp file handling
        if os.name == 'posix':  # Linux/Unix
            # Use /tmp explicitly on Linux with proper permissions
            temp_dir = '/tmp'
            # Ensure temp directory is writable
            if not os.access(temp_dir, os.W_OK):
                temp_dir = None  # Fall back to system default
                print("PandocExporter: Cannot write to /tmp, using system default temp directory")
        else:
            temp_dir = None
        
        # Create temporary output file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{output_format}', dir=temp_dir) as temp_output:
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
        # Add OS-specific logging
        import platform
        print(f"Platform: {platform.system()}")
        print(f"Platform version: {platform.version()}")
        print(f"Architecture: {platform.machine()}")
        print(f"OS name: {os.name}")
        
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
        
        # Check file system capabilities on Linux
        if os.name == 'posix':
            try:
                test_file = os.path.join(project_path, '.test_write')
                with open(test_file, 'w') as f:
                    f.write('test')
                os.unlink(test_file)
                print("File system write test passed")
            except Exception as e:
                print(f"File system write test failed: {e}")
                raise HTTPException(status_code=500, detail=f"File system access issue: {e}")
        
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

@router.get("/health")
async def compiler_health_check(
    current_user: User = Depends(get_current_active_superuser)
):
    """Health check endpoint for debugging Linux-specific issues - Admin only"""
    import platform
    import tempfile
    import subprocess
    
    health_info = {
        "platform": {
            "system": platform.system(),
            "architecture": platform.machine(),
            "python_version": platform.python_version()
        },
        "file_system": {
            "temp_dir_writable": os.access(tempfile.gettempdir(), os.W_OK),
            "current_dir_writable": os.access(os.getcwd(), os.W_OK)
        },
        "dependencies": {
            "pandoc_available": False,
            "pandoc_version": None,
            "pandoc_error": None
        },
        "environment": {
            "temp_vars_set": bool(os.environ.get('TEMP') or os.environ.get('TMP') or os.environ.get('TMPDIR'))
        }
    }
    
    # Check Pandoc availability
    try:
        result = subprocess.run(['pandoc', '--version'], 
                              capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            health_info["dependencies"]["pandoc_available"] = True
            version_match = result.stdout.strip().split('\n')[0]
            health_info["dependencies"]["pandoc_version"] = version_match
        else:
            health_info["dependencies"]["pandoc_error"] = result.stderr.strip()
    except subprocess.TimeoutExpired:
        health_info["dependencies"]["pandoc_error"] = "Timeout checking pandoc"
    except FileNotFoundError:
        health_info["dependencies"]["pandoc_error"] = "Pandoc not found in PATH"
    except Exception as e:
        health_info["dependencies"]["pandoc_error"] = str(e)
    
    # Test temp file creation
    try:
        with tempfile.NamedTemporaryFile(mode='w', delete=False) as f:
            f.write('test')
            temp_file_path = f.name
        
        # Test reading the temp file
        with open(temp_file_path, 'r') as f:
            content = f.read()
        
        # Clean up
        os.unlink(temp_file_path)
        
        health_info["file_system"]["temp_file_test"] = "PASSED"
    except Exception as e:
        health_info["file_system"]["temp_file_test"] = f"FAILED: {str(e)}"
    
    return health_info

@router.get("/status")
async def compiler_status(
    current_user: User = Depends(get_current_user)
):
    """Basic compiler status check - Available to all authenticated users"""
    import subprocess
    
    status_info = {
        "status": "operational",
        "dependencies": {
            "pandoc_available": False
        }
    }
    
    # Check Pandoc availability (basic check only)
    try:
        result = subprocess.run(['pandoc', '--version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            status_info["dependencies"]["pandoc_available"] = True
        else:
            status_info["status"] = "degraded"
            status_info["dependencies"]["pandoc_available"] = False
    except Exception:
        status_info["status"] = "degraded"
        status_info["dependencies"]["pandoc_available"] = False
    
    return status_info

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