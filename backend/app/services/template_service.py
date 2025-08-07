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
        """Process template with provided data"""
        processed_content = template_content
        
        # Replace standard variables
        for key, value in data.items():
            if isinstance(value, str):
                processed_content = processed_content.replace(f'${key}$', value)
            elif isinstance(value, (int, float)):
                processed_content = processed_content.replace(f'${key}$', str(value))
        
        # Handle nodes array
        if 'nodes' in data:
            processed_content = self._process_nodes_array(processed_content, data['nodes'])
        
        return processed_content
    
    def _process_nodes_array(self, template: str, nodes: List[Dict[str, Any]]) -> str:
        """Process the nodes array in the template"""
        # Find the for loop pattern
        for_match = re.search(r'\$for\(nodes\)\$(.*?)\$endfor\$', template, re.DOTALL)
        if not for_match:
            return template
        
        loop_content = for_match.group(1)
        nodes_content = []
        
        for node in nodes:
            node_content = loop_content
            
            # Replace node variables
            for key, value in node.items():
                if isinstance(value, str):
                    node_content = node_content.replace(f'$nodes.{key}$', value)
                elif isinstance(value, (int, float)):
                    node_content = node_content.replace(f'$nodes.{key}$', str(value))
                elif isinstance(value, dict):
                    # Handle metadata
                    for meta_key, meta_value in value.items():
                        node_content = node_content.replace(
                            f'$nodes.{key}.{meta_key}$', 
                            str(meta_value)
                        )
                elif isinstance(value, list):
                    # Handle attachments
                    if key == 'attachments':
                        attachments_content = []
                        for attachment in value:
                            attachment_text = f"- {attachment.get('name', 'Unknown')}"
                            if 'size' in attachment:
                                attachment_text += f" ({attachment['size']})"
                            attachments_content.append(attachment_text)
                        node_content = node_content.replace(
                            '$nodes.attachments$', 
                            '\n'.join(attachments_content)
                        )
            
            nodes_content.append(node_content)
        
        # Replace the entire for loop with processed content
        return template.replace(
            for_match.group(0),
            '\n\n'.join(nodes_content)
        )
    
    def convert_with_pandoc(self, markdown_content: str, output_format: str, 
                           output_file: str, working_dir: str = None) -> Tuple[bool, str]:
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