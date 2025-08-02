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
            # Filter out empty paths and ensure we have valid node names
            valid_nodes = []
            for path in node_paths:
                if path and path.strip():
                    node_name = os.path.basename(path).replace('.md', '')
                    if node_name:  # Only add if we have a valid name
                        valid_nodes.append((path, node_name))
            
            # Only add TOC if we have valid nodes
            if valid_nodes:
                for i, (path, node_name) in enumerate(valid_nodes, 1):
                    # Create a clean anchor link
                    anchor = node_name.lower().replace(' ', '-').replace('_', '-')
                    sections.append(f"{i}. [{node_name}](#{anchor})\n")
                sections.append("\n---\n\n")
            else:
                # If no valid nodes, just add the separator
                sections.append("---\n\n")
        
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
                    # Format the front matter nicely
                    if front_matter_lines:
                        cleaned_lines.append("### Metadata\n")
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
    
    def _add_embedded_files(self, content: str, node_path: str) -> Optional[str]:
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
            
            # Create embedded files section
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

class MarkdownExporter:
    """Markdown format exporter"""
    
    def export(self, content: str, options: Dict[str, Any]) -> bytes:
        """Export content as Markdown"""
        return content.encode('utf-8')

class HtmlExporter:
    """HTML format exporter"""
    
    def export(self, content: str, options: Dict[str, Any]) -> bytes:
        """Export content as HTML"""
        # Convert markdown to HTML
        html_content = self._markdown_to_html(content)
        
        # Wrap in HTML document with better styling
        full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{options.get('title', 'Document')}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background-color: #fff;
        }}
        
        h1, h2, h3, h4, h5, h6 {{
            color: #2c3e50;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
        }}
        
        h1 {{
            font-size: 2.5em;
            border-bottom: 3px solid #3498db;
            padding-bottom: 0.3em;
            margin-top: 0;
        }}
        
        h2 {{
            font-size: 2em;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 0.2em;
        }}
        
        h3 {{
            font-size: 1.5em;
            border-bottom: 1px solid #ecf0f1;
            padding-bottom: 0.1em;
        }}
        
        p {{
            margin-bottom: 1em;
        }}
        
        ul, ol {{
            margin-bottom: 1em;
            padding-left: 2em;
        }}
        
        li {{
            margin-bottom: 0.5em;
        }}
        
        blockquote {{
            border-left: 4px solid #3498db;
            margin: 1em 0;
            padding-left: 1em;
            color: #555;
            font-style: italic;
        }}
        
        code {{
            background: #f8f9fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 0.9em;
            color: #e74c3c;
        }}
        
        pre {{
            background: #f8f9fa;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
            margin: 1em 0;
            border: 1px solid #e9ecef;
        }}
        
        pre code {{
            background: none;
            padding: 0;
            color: #333;
        }}
        
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }}
        
        th, td {{
            border: 1px solid #ddd;
            padding: 0.75em;
            text-align: left;
        }}
        
        th {{
            background: #f8f9fa;
            font-weight: 600;
        }}
        
        tr:nth-child(even) {{
            background: #f8f9fa;
        }}
        
        hr {{
            border: none;
            border-top: 2px solid #ecf0f1;
            margin: 2em 0;
        }}
        
        a {{
            color: #3498db;
            text-decoration: none;
        }}
        
        a:hover {{
            text-decoration: underline;
        }}
        
        .toc {{
            background: #f8f9fa;
            padding: 1.5em;
            border-radius: 5px;
            margin: 2em 0;
            border-left: 4px solid #3498db;
        }}
        
        .toc h2 {{
            margin-top: 0;
            border-bottom: none;
        }}
        
        .toc ul {{
            list-style-type: none;
            padding-left: 0;
        }}
        
        .toc li {{
            margin-bottom: 0.3em;
        }}
        
        .toc a {{
            color: #2c3e50;
            text-decoration: none;
        }}
        
        .toc a:hover {{
            color: #3498db;
        }}
        
        @media print {{
            body {{
                max-width: none;
                padding: 1em;
            }}
            
            h1, h2, h3 {{
                page-break-after: avoid;
            }}
            
            pre, blockquote {{
                page-break-inside: avoid;
            }}
        }}
    </style>
</head>
<body>
{html_content}
</body>
</html>"""
        
        return full_html.encode('utf-8')
    
    def _markdown_to_html(self, markdown: str) -> str:
        """Convert markdown to HTML with comprehensive parsing"""
        html = markdown
        
        # Process code blocks first (before inline code)
        html = self._process_code_blocks(html)
        
        # Process headers
        html = self._process_headers(html)
        
        # Process lists
        html = self._process_lists(html)
        
        # Process blockquotes
        html = self._process_blockquotes(html)
        
        # Process tables
        html = self._process_tables(html)
        
        # Process inline formatting
        html = self._process_inline_formatting(html)
        
        # Process links
        html = self._process_links(html)
        
        # Process horizontal rules
        html = html.replace('\n---\n', '\n<hr>\n')
        html = html.replace('\n***\n', '\n<hr>\n')
        html = html.replace('\n___\n', '\n<hr>\n')
        
        # Process line breaks
        html = html.replace('\n\n', '</p><p>')
        html = '<p>' + html + '</p>'
        
        # Clean up empty paragraphs
        html = html.replace('<p></p>', '')
        html = html.replace('<p><p>', '<p>')
        html = html.replace('</p></p>', '</p>')
        
        return html
    
    def _process_code_blocks(self, text: str) -> str:
        """Process code blocks with language specification"""
        import re
        
        # Handle fenced code blocks with language
        def code_block_replacer(match):
            language = match.group(1) or ''
            code = match.group(2)
            return f'<pre><code class="language-{language}">{code}</code></pre>'
        
        # Match ```language\ncode\n```
        text = re.sub(r'```(\w+)?\n(.*?)\n```', code_block_replacer, text, flags=re.DOTALL)
        
        # Handle indented code blocks
        lines = text.split('\n')
        in_code_block = False
        code_lines = []
        result_lines = []
        
        for line in lines:
            if line.startswith('    ') and not in_code_block:
                in_code_block = True
                code_lines.append(line[4:])
            elif line.startswith('    ') and in_code_block:
                code_lines.append(line[4:])
            elif in_code_block:
                # End of code block
                if code_lines:
                    result_lines.append(f'<pre><code>{"\n".join(code_lines)}</code></pre>')
                result_lines.append(line)
                code_lines = []
                in_code_block = False
            else:
                result_lines.append(line)
        
        # Handle code block at end
        if in_code_block and code_lines:
            result_lines.append(f'<pre><code>{"\n".join(code_lines)}</code></pre>')
        
        return '\n'.join(result_lines)
    
    def _process_headers(self, text: str) -> str:
        """Process markdown headers"""
        import re
        
        # Process headers in order (h1 to h6)
        for i in range(6, 0, -1):
            pattern = r'^' + '#' * i + r'\s+(.+)$'
            replacement = f'<h{i}>\\1</h{i}>'
            text = re.sub(pattern, replacement, text, flags=re.MULTILINE)
        
        return text
    
    def _process_lists(self, text: str) -> str:
        """Process ordered and unordered lists"""
        import re
        
        lines = text.split('\n')
        result_lines = []
        in_list = False
        list_type = None
        list_items = []
        
        for line in lines:
            # Check for list items
            ul_match = re.match(r'^[\s]*[-*+]\s+(.+)$', line)
            ol_match = re.match(r'^[\s]*\d+\.\s+(.+)$', line)
            
            if ul_match or ol_match:
                if not in_list:
                    in_list = True
                    list_type = 'ul' if ul_match else 'ol'
                
                content = ul_match.group(1) if ul_match else ol_match.group(1)
                # Only add non-empty list items
                if content.strip():
                    list_items.append(f'<li>{content}</li>')
            elif in_list and line.strip() == '':
                # Empty line within list - don't add empty list items
                continue
            elif in_list:
                # End of list
                if list_items:
                    result_lines.append(f'<{list_type}>')
                    result_lines.extend(list_items)
                    result_lines.append(f'</{list_type}>')
                result_lines.append(line)
                list_items = []
                in_list = False
                list_type = None
            else:
                result_lines.append(line)
        
        # Handle list at end
        if in_list and list_items:
            result_lines.append(f'<{list_type}>')
            result_lines.extend(list_items)
            result_lines.append(f'</{list_type}>')
        
        return '\n'.join(result_lines)
    
    def _process_blockquotes(self, text: str) -> str:
        """Process blockquotes"""
        import re
        
        lines = text.split('\n')
        result_lines = []
        in_quote = False
        quote_lines = []
        
        for line in lines:
            if line.startswith('> '):
                if not in_quote:
                    in_quote = True
                quote_lines.append(line[2:])
            elif in_quote:
                # End of blockquote
                if quote_lines:
                    result_lines.append(f'<blockquote>{"".join(quote_lines)}</blockquote>')
                result_lines.append(line)
                quote_lines = []
                in_quote = False
            else:
                result_lines.append(line)
        
        # Handle blockquote at end
        if in_quote and quote_lines:
            result_lines.append(f'<blockquote>{"".join(quote_lines)}</blockquote>')
        
        return '\n'.join(result_lines)
    
    def _process_tables(self, text: str) -> str:
        """Process markdown tables"""
        import re
        
        lines = text.split('\n')
        result_lines = []
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            # Check if this line looks like a table header
            if '|' in line and i + 1 < len(lines):
                next_line = lines[i + 1]
                # Check if next line is a separator
                if re.match(r'^[\s]*\|[\s]*[-:|\s]+\|[\s]*$', next_line):
                    # This is a table
                    table_lines = [line]
                    j = i + 1
                    
                    # Collect all table rows
                    while j < len(lines) and ('|' in lines[j] or re.match(r'^[\s]*\|[\s]*[-:|\s]+\|[\s]*$', lines[j])):
                        table_lines.append(lines[j])
                        j += 1
                    
                    # Convert table to HTML
                    html_table = self._convert_table_to_html(table_lines)
                    result_lines.append(html_table)
                    
                    i = j
                    continue
            
            result_lines.append(line)
            i += 1
        
        return '\n'.join(result_lines)
    
    def _convert_table_to_html(self, table_lines: list) -> str:
        """Convert markdown table lines to HTML table"""
        html_lines = ['<table>']
        
        for i, line in enumerate(table_lines):
            if '|' not in line:
                continue
                
            # Skip separator lines
            if re.match(r'^[\s]*\|[\s]*[-:|\s]+\|[\s]*$', line):
                continue
            
            # Parse table row
            cells = [cell.strip() for cell in line.split('|')[1:-1]]  # Remove empty first/last cells
            
            if i == 0:
                # Header row
                html_lines.append('<thead><tr>')
                for cell in cells:
                    html_lines.append(f'<th>{cell}</th>')
                html_lines.append('</tr></thead><tbody>')
            else:
                # Data row
                html_lines.append('<tr>')
                for cell in cells:
                    html_lines.append(f'<td>{cell}</td>')
                html_lines.append('</tr>')
        
        html_lines.append('</tbody></table>')
        return '\n'.join(html_lines)
    
    def _process_inline_formatting(self, text: str) -> str:
        """Process inline markdown formatting"""
        import re
        
        # Bold: **text** or __text__
        text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'__(.*?)__', r'<strong>\1</strong>', text)
        
        # Italic: *text* or _text_
        text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', text)
        text = re.sub(r'_(.*?)_', r'<em>\1</em>', text)
        
        # Inline code: `code`
        text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
        
        # Strikethrough: ~~text~~
        text = re.sub(r'~~(.*?)~~', r'<del>\1</del>', text)
        
        return text
    
    def _process_links(self, text: str) -> str:
        """Process markdown links"""
        import re
        
        # Links: [text](url)
        text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
        
        # Images: ![alt](url)
        text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1">', text)
        
        return text

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
        content = aggregator.aggregate_content(request.nodes, request.options)
        
        # Create exporter
        print(f"Creating exporter for format: {request.format}")
        exporter = ExporterFactory.create_exporter(request.format)
        
        # Export content
        print("Exporting content...")
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