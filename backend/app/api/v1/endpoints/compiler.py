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
                        custom_variables: Optional[Dict[str, Any]] = None) -> str:
        """Aggregate content from multiple nodes into a single document"""
        
        # If template is specified, use template-based processing
        if template_path:
            return self._process_with_template(node_paths, options, template_path, custom_variables)
        
        # Find default template for the format
        format_type = options.get('format', 'pdf')
        default_template_path = self._find_default_template(format_type)
        
        if not default_template_path:
            raise ValueError(f"No default template found for format: {format_type}. Please select a template or create one.")
        
        return self._process_with_template(node_paths, options, default_template_path, custom_variables)
    
    def _process_with_template(self, node_paths: List[str], options: Dict[str, Any],
                             template_path: str, custom_variables: Optional[Dict[str, Any]] = None) -> str:
        """Process content using a template"""
        
        # Get template content
        template_content = self.template_service.get_template_content(template_path)
        if not template_content:
            raise ValueError(f"Template not found: {template_path}")
        
        # Validate template
        is_valid, custom_vars = self.template_service.validate_template(template_content)
        if not is_valid:
            raise ValueError(f"Invalid template: {custom_vars}")
        
        # Prepare data for template
        data = {
            'title': options.get('title', 'Document'),
            'author': options.get('author', 'Unknown'),
            'date': options.get('date', ''),
            'nodes': []
        }
        
        # Add custom variables
        if custom_variables:
            data.update(custom_variables)
        
        # Process each node
        for path in node_paths:
            try:
                full_path = os.path.join(self.project_path, path)
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
                    
                    data['nodes'].append(node_data)
                    
            except Exception as e:
                # Add error node
                data['nodes'].append({
                    'title': os.path.basename(path),
                    'content': f"*Error loading file: {str(e)}*",
                    'metadata': {},
                    'attachments': [],
                    'path': path
                })
        
        # Process template with data
        return self.template_service.process_template(template_content, data)
    
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
            settings_file = os.path.join(self.project_path, 'verbweaver-settings.yaml')
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
        from pathlib import Path
        
        # Get the directory of the current node for relative path resolution
        node_dir = os.path.dirname(os.path.join(self.project_path, node_path))
        
        # Process existing image references to ensure they're relative to project root
        def fix_image_paths(match):
            img_path = match.group(2)
            alt_text = match.group(1)
            title = match.group(3) if match.group(3) else ""
            
            # If it's already an absolute path or URL, leave it as is
            if img_path.startswith(('http://', 'https://', '/')):
                return match.group(0)
            
            # Make path relative to project root
            full_img_path = os.path.join(node_dir, img_path)
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
        
        print(f"PandocExporter: Output file: {output_file}")
        
        try:
            # Convert using Pandoc with proper working directory
            success, message = self.template_service.convert_with_pandoc(
                content, output_format, output_file, self.project_path
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
            if os.path.exists(output_file):
                os.unlink(output_file)

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
            request.custom_variables
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
    
    # Create template service
    template_service = TemplateService(project_path)
    
    if format_type:
        # Get templates for specific format
        templates = template_service.get_available_templates(format_type)
    else:
        # Get templates for all formats
        templates = []
        for fmt in template_service.supported_formats:
            templates.extend(template_service.get_available_templates(fmt))
    
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
    
    # Create template service
    template_service = TemplateService(project_path)
    
    # Get template content
    content = template_service.get_template_content(template_path)
    if not content:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Validate template
    is_valid, custom_variables = template_service.validate_template(content)
    
    return {
        "content": content,
        "is_valid": is_valid,
        "custom_variables": custom_variables
    } 