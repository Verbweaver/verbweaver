"""
Compiler endpoints
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import io
import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.core.security import get_current_user
from app.services.git_service import GitService

router = APIRouter()

class CompileRequest(BaseModel):
    nodes: List[str]
    format: str
    options: Dict[str, Any]

class CompileResponse(BaseModel):
    success: bool
    message: str
    filename: str

class ContentAggregator:
    """Reusable content aggregation logic"""
    
    def __init__(self, project_path: str):
        self.project_path = project_path
        self.git_service = GitService(project_path)
    
    def aggregate_content(self, node_paths: List[str], options: Dict[str, Any]) -> str:
        """Aggregate content from multiple nodes into a single document"""
        
        # Load and process each node
        sections = []
        metadata = options.get('title', 'Document')
        author = options.get('author', 'Unknown')
        embed_files = options.get('embedUploadedFiles', True)
        
        # Add document header
        if options.get('includeMetadata', True):
            sections.append(f"# {metadata}\n")
            if author:
                sections.append(f"**Author:** {author}\n")
            sections.append("---\n\n")
        
        # Add table of contents if requested
        if options.get('includeToc', True):
            sections.append("## Table of Contents\n\n")
            for i, path in enumerate(node_paths, 1):
                node_name = os.path.basename(path).replace('.md', '')
                sections.append(f"{i}. [{node_name}](#{node_name.lower().replace(' ', '-')})\n")
            sections.append("\n---\n\n")
        
        # Add content from each node
        for path in node_paths:
            try:
                full_path = os.path.join(self.project_path, path)
                if os.path.exists(full_path):
                    with open(full_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Extract title from content or use filename
                    title = self._extract_title(content) or os.path.basename(path).replace('.md', '')
                    
                    # Add section header
                    sections.append(f"## {title}\n\n")
                    
                    # Add content (strip any existing headers)
                    clean_content = self._clean_content(content)
                    sections.append(clean_content)
                    
                    # Add embedded files if requested
                    if embed_files:
                        embedded_files_section = self._add_embedded_files(content, path)
                        if embedded_files_section:
                            sections.append("\n\n")
                            sections.append(embedded_files_section)
                    
                    sections.append("\n\n")
                else:
                    sections.append(f"## {os.path.basename(path)}\n\n*File not found*\n\n")
            except Exception as e:
                sections.append(f"## {os.path.basename(path)}\n\n*Error loading file: {str(e)}*\n\n")
        
        return ''.join(sections)
    
    def _extract_title(self, content: str) -> Optional[str]:
        """Extract title from markdown content"""
        lines = content.split('\n')
        for line in lines:
            if line.startswith('# '):
                return line[2:].strip()
        return None
    
    def _clean_content(self, content: str) -> str:
        """Clean content by removing the first header if it exists"""
        lines = content.split('\n')
        cleaned_lines = []
        skip_first_header = True
        
        for line in lines:
            if skip_first_header and line.startswith('# '):
                skip_first_header = False
                continue
            cleaned_lines.append(line)
        
        return '\n'.join(cleaned_lines).strip()
    
    def _add_embedded_files(self, content: str, node_path: str) -> Optional[str]:
        """Add embedded files section if task has uploaded files"""
        try:
            # Parse front matter to get task metadata
            import yaml
            import re
            
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
            
            # Create embedded files section
            sections = []
            sections.append("### Attachments\n\n")
            
            for file_info in files:
                file_name = file_info.get('originalName', file_info.get('name', 'Unknown File'))
                file_size = file_info.get('size', 0)
                uploaded_at = file_info.get('uploadedAt', '')
                
                # Format file size
                size_str = self._format_file_size(file_size)
                
                sections.append(f"- **{file_name}** ({size_str})")
                if uploaded_at:
                    sections.append(f" - Uploaded: {uploaded_at}")
                sections.append("\n")
            
            return ''.join(sections)
            
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

class MarkdownExporter:
    """Markdown format exporter"""
    
    def export(self, content: str, options: Dict[str, Any]) -> bytes:
        """Export content as Markdown"""
        return content.encode('utf-8')

class HtmlExporter:
    """HTML format exporter"""
    
    def export(self, content: str, options: Dict[str, Any]) -> bytes:
        """Export content as HTML"""
        # Simple markdown to HTML conversion
        html_content = self._markdown_to_html(content)
        
        # Wrap in HTML document
        full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{options.get('title', 'Document')}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }}
        h1, h2, h3 {{ color: #333; }}
        h1 {{ border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }}
        h2 {{ border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }}
        code {{ background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 3px; }}
        pre {{ background: #f5f5f5; padding: 1rem; border-radius: 5px; overflow-x: auto; }}
        blockquote {{ border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 0.5rem; text-align: left; }}
        th {{ background: #f5f5f5; }}
    </style>
</head>
<body>
{html_content}
</body>
</html>"""
        
        return full_html.encode('utf-8')
    
    def _markdown_to_html(self, markdown: str) -> str:
        """Simple markdown to HTML conversion"""
        # This is a basic implementation - in production you'd use a proper markdown parser
        html = markdown
        
        # Headers
        html = html.replace('\n# ', '\n<h1>').replace('\n## ', '\n<h2>').replace('\n### ', '\n<h3>')
        html = html.replace('\n\n# ', '\n\n<h1>').replace('\n\n## ', '\n\n<h2>').replace('\n\n### ', '\n\n<h3>')
        
        # Bold
        html = html.replace('**', '<strong>').replace('**', '</strong>')
        
        # Italic
        html = html.replace('*', '<em>').replace('*', '</em>')
        
        # Code blocks
        html = html.replace('```', '<pre><code>').replace('```', '</code></pre>')
        
        # Inline code
        html = html.replace('`', '<code>').replace('`', '</code>')
        
        # Line breaks
        html = html.replace('\n\n', '</p><p>')
        html = '<p>' + html + '</p>'
        
        return html

class ExporterFactory:
    """Factory for creating exporters based on format"""
    
    @staticmethod
    def create_exporter(format_type: str):
        exporters = {
            'markdown': MarkdownExporter(),
            'html': HtmlExporter(),
            # Add more exporters as needed
            # 'pdf': PdfExporter(),
            # 'docx': DocxExporter(),
        }
        
        if format_type not in exporters:
            raise ValueError(f"Unsupported format: {format_type}")
        
        return exporters[format_type]

@router.post("/{project_id}/compile")
async def compile_document(
    project_id: str,
    request: CompileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Compile selected nodes into a document"""
    
    try:
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
        project_path = project.path
        
        # Validate project path exists
        if not os.path.exists(project_path):
            raise HTTPException(status_code=404, detail="Project directory not found")
        
        # Create content aggregator
        aggregator = ContentAggregator(project_path)
        
        # Aggregate content
        content = aggregator.aggregate_content(request.nodes, request.options)
        
        # Create exporter
        exporter = ExporterFactory.create_exporter(request.format)
        
        # Export content
        exported_content = exporter.export(content, request.options)
        
        # Generate filename
        title = request.options.get('title', 'document')
        filename = f"{title}.{request.format}"
        
        # Return as streaming response
        return StreamingResponse(
            io.BytesIO(exported_content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
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

@router.get("/templates")
async def get_templates():
    """Get list of available document templates"""
    return {
        "templates": [
            {"id": "default", "name": "Default", "description": "Standard document template"},
            {"id": "academic", "name": "Academic", "description": "Academic paper template"},
            {"id": "book", "name": "Book", "description": "Book manuscript template"},
            {"id": "report", "name": "Report", "description": "Business report template"},
        ]
    } 