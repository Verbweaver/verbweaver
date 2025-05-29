"""
Node service for managing nodes as Markdown files in Git repositories.
Implements the unified model where nodes, tasks, and files are all the same thing.
"""
import os
import re
import yaml
import aiofiles
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
import uuid
from pathlib import Path
import json
import shutil

from app.models import Project
from app.services.git_service import GitService


class NodeService:
    """Service for managing nodes as Markdown files with YAML front matter."""
    
    def __init__(self, project: Project):
        self.project = project
        self.git_service = GitService(project)
        self.project_path = self.git_service.repo_path
    
    @staticmethod
    def generate_id() -> str:
        """Generate a unique node ID."""
        return f"node-{int(datetime.now().timestamp())}-{uuid.uuid4().hex[:9]}"
    
    @staticmethod
    def sanitize_filename(name: str) -> str:
        """Sanitize a filename by removing invalid characters."""
        # Remove or replace invalid characters
        sanitized = re.sub(r'[<>:"/\\|?*]', '-', name).strip()
        # Remove multiple consecutive dashes
        sanitized = re.sub(r'-+', '-', sanitized)
        return sanitized
    
    async def parse_markdown_with_frontmatter(self, content: str) -> Tuple[Dict[str, Any], str]:
        """Parse Markdown content with YAML front matter."""
        match = re.match(r'^---\n(.*?)\n---\n(.*)$', content, re.DOTALL)
        if match:
            try:
                metadata = yaml.safe_load(match.group(1)) or {}
                return metadata, match.group(2)
            except yaml.YAMLError:
                # Invalid YAML, return empty metadata
                return {}, content
        return {}, content
    
    async def stringify_markdown_with_frontmatter(self, metadata: Dict[str, Any], content: str) -> str:
        """Convert metadata and content back to Markdown with YAML front matter."""
        yaml_str = yaml.dump(metadata, default_flow_style=False, allow_unicode=True, sort_keys=False)
        return f"---\n{yaml_str}---\n{content}"
    
    async def read_node(self, path: str) -> Optional[Dict[str, Any]]:
        """Read a node from a file path."""
        full_path = os.path.join(self.project_path, path)
        
        if not os.path.exists(full_path):
            return None
        
        is_directory = os.path.isdir(full_path)
        name = os.path.basename(path)
        is_markdown = name.endswith('.md')
        
        # Default metadata
        metadata = {
            'id': self.generate_id(),
            'title': name.replace('.md', '') if is_markdown else name,
            'type': 'folder' if is_directory else 'file',
            'created': datetime.now().isoformat(),
            'modified': datetime.now().isoformat()
        }
        
        content = None
        
        if is_markdown and not is_directory:
            # Read Markdown file with front matter
            try:
                async with aiofiles.open(full_path, 'r', encoding='utf-8') as f:
                    file_content = await f.read()
                parsed_metadata, parsed_content = await self.parse_markdown_with_frontmatter(file_content)
                metadata.update(parsed_metadata)
                content = parsed_content
            except Exception:
                pass
        elif not is_directory:
            # Check for .metadata.md file for non-Markdown files
            metadata_path = f"{full_path}.metadata.md"
            if os.path.exists(metadata_path):
                try:
                    async with aiofiles.open(metadata_path, 'r', encoding='utf-8') as f:
                        metadata_content = await f.read()
                    parsed_metadata, _ = await self.parse_markdown_with_frontmatter(metadata_content)
                    metadata.update(parsed_metadata)
                except Exception:
                    pass
        
        # Build hard links (directory structure)
        parent = os.path.dirname(path) if path and '/' in path else None
        children = []
        
        if is_directory:
            try:
                for item in os.listdir(full_path):
                    child_path = os.path.join(path, item).replace('\\', '/')
                    children.append(child_path)
            except Exception:
                pass
        
        return {
            'path': path,
            'name': name,
            'isDirectory': is_directory,
            'isMarkdown': is_markdown,
            'metadata': metadata,
            'content': content,
            'hardLinks': {
                'parent': parent,
                'children': children
            },
            'softLinks': metadata.get('links', []),
            'hasTask': 'task' in metadata,
            'taskStatus': metadata.get('task', {}).get('status') if 'task' in metadata else None
        }
    
    async def create_node(self, parent_path: str, name: str, node_type: str, 
                         initial_metadata: Optional[Dict[str, Any]] = None, 
                         initial_content: Optional[str] = None) -> Dict[str, Any]:
        """Create a new node (Markdown file)."""
        sanitized_name = self.sanitize_filename(name)
        filename = sanitized_name if sanitized_name.endswith('.md') else f"{sanitized_name}.md"
        
        if parent_path:
            path = os.path.join(parent_path, filename).replace('\\', '/')
            full_path = os.path.join(self.project_path, parent_path, filename)
        else:
            path = filename
            full_path = os.path.join(self.project_path, filename)
        
        # Ensure parent directory exists
        parent_dir = os.path.dirname(full_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        
        # Create metadata
        metadata = {
            'id': self.generate_id(),
            'title': sanitized_name.replace('.md', ''),
            'type': node_type,
            'created': datetime.now().isoformat(),
            'modified': datetime.now().isoformat()
        }
        
        if initial_metadata:
            metadata.update(initial_metadata)
        
        # Create content
        content = initial_content or f"# {metadata['title']}\n\n"
        
        # Write file
        file_content = await self.stringify_markdown_with_frontmatter(metadata, content)
        async with aiofiles.open(full_path, 'w', encoding='utf-8') as f:
            await f.write(file_content)
        
        # Commit to Git
        await self.git_service.add_and_commit([path], f"Created node: {metadata['title']}")
        
        # Return the created node
        return await self.read_node(path)
    
    async def update_node(self, path: str, metadata_updates: Optional[Dict[str, Any]] = None, 
                         content: Optional[str] = None) -> Dict[str, Any]:
        """Update a node's metadata and/or content."""
        node = await self.read_node(path)
        if not node:
            raise FileNotFoundError(f"Node not found: {path}")
        
        full_path = os.path.join(self.project_path, path)
        
        # Update metadata
        updated_metadata = node['metadata'].copy()
        if metadata_updates:
            updated_metadata.update(metadata_updates)
        updated_metadata['modified'] = datetime.now().isoformat()
        
        # Handle content
        updated_content = content if content is not None else node.get('content', '')
        
        if node['isMarkdown'] and updated_content is not None:
            # Update Markdown file
            file_content = await self.stringify_markdown_with_frontmatter(updated_metadata, updated_content)
            async with aiofiles.open(full_path, 'w', encoding='utf-8') as f:
                await f.write(file_content)
            
            # Commit changes
            await self.git_service.add_and_commit([path], f"Updated node: {updated_metadata['title']}")
        else:
            # Update metadata file for non-Markdown files
            metadata_path = f"{path}.metadata.md"
            full_metadata_path = f"{full_path}.metadata.md"
            
            metadata_content = await self.stringify_markdown_with_frontmatter(updated_metadata, '')
            async with aiofiles.open(full_metadata_path, 'w', encoding='utf-8') as f:
                await f.write(metadata_content)
            
            # Commit changes
            await self.git_service.add_and_commit([metadata_path], f"Updated metadata for: {updated_metadata['title']}")
        
        # Return updated node
        return await self.read_node(path)
    
    async def delete_node(self, path: str) -> None:
        """Delete a node (file or directory)."""
        full_path = os.path.join(self.project_path, path)
        
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"Node not found: {path}")
        
        files_to_remove = [path]
        
        # Check for metadata file
        metadata_path = f"{path}.metadata.md"
        full_metadata_path = f"{full_path}.metadata.md"
        if os.path.exists(full_metadata_path):
            files_to_remove.append(metadata_path)
        
        # Delete from filesystem
        if os.path.isdir(full_path):
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)
        
        # Delete metadata file if it exists
        if os.path.exists(full_metadata_path):
            os.remove(full_metadata_path)
        
        # Commit deletion
        await self.git_service.remove_and_commit(files_to_remove, f"Deleted node: {os.path.basename(path)}")
    
    async def create_soft_link(self, source_path: str, target_path: str) -> None:
        """Create a soft link between two nodes."""
        source_node = await self.read_node(source_path)
        target_node = await self.read_node(target_path)
        
        if not source_node or not target_node:
            raise FileNotFoundError("Source or target node not found")
        
        # Get current links
        links = source_node['metadata'].get('links', [])
        target_id = target_node['metadata']['id']
        
        # Add link if not already present
        if target_id not in links:
            links.append(target_id)
            await self.update_node(source_path, {'links': links})
    
    async def remove_soft_link(self, source_path: str, target_id: str) -> None:
        """Remove a soft link between two nodes."""
        source_node = await self.read_node(source_path)
        if not source_node:
            raise FileNotFoundError("Source node not found")
        
        # Remove link
        links = source_node['metadata'].get('links', [])
        if target_id in links:
            links.remove(target_id)
            await self.update_node(source_path, {'links': links})
    
    async def list_nodes(self, directory: Optional[str] = None, exclude_templates: bool = True) -> List[Dict[str, Any]]:
        """List all nodes in a directory (or entire project)."""
        nodes = []
        
        start_path = self.project_path
        if directory:
            start_path = os.path.join(self.project_path, directory)
        
        for root, dirs, files in os.walk(start_path):
            # Calculate relative path from project root
            rel_root = os.path.relpath(root, self.project_path).replace('\\', '/')
            if rel_root == '.':
                rel_root = ''
            
            # Skip templates directory if requested
            if exclude_templates and 'templates' in rel_root.split('/'):
                continue
            
            # Add directories as nodes
            for dir_name in dirs:
                if dir_name.startswith('.'):  # Skip hidden directories
                    continue
                # Skip templates directory at root level
                if exclude_templates and rel_root == '' and dir_name == 'templates':
                    continue
                dir_path = os.path.join(rel_root, dir_name).replace('\\', '/') if rel_root else dir_name
                node = await self.read_node(dir_path)
                if node:
                    nodes.append(node)
            
            # Add files as nodes
            for file_name in files:
                if file_name.startswith('.'):  # Skip hidden files
                    continue
                file_path = os.path.join(rel_root, file_name).replace('\\', '/') if rel_root else file_name
                # Skip metadata files (they're handled with their main files)
                if file_path.endswith('.metadata.md'):
                    continue
                node = await self.read_node(file_path)
                if node:
                    nodes.append(node)
        
        return nodes
    
    async def search_nodes(self, query: str, node_type: Optional[str] = None, 
                          has_task: Optional[bool] = None) -> List[Dict[str, Any]]:
        """Search for nodes based on various criteria."""
        all_nodes = await self.list_nodes()
        results = []
        
        query_lower = query.lower() if query else ''
        
        for node in all_nodes:
            # Filter by type
            if node_type and node['metadata'].get('type') != node_type:
                continue
            
            # Filter by task presence
            if has_task is not None and node['hasTask'] != has_task:
                continue
            
            # Search in title and content
            if query:
                title_match = query_lower in node['metadata'].get('title', '').lower()
                content_match = node.get('content') and query_lower in node['content'].lower()
                if not (title_match or content_match):
                    continue
            
            results.append(node)
        
        return results
    
    async def create_empty_template(self) -> None:
        """Create the default Empty template for a project."""
        templates_dir = os.path.join(self.project_path, 'templates')
        os.makedirs(templates_dir, exist_ok=True)
        
        # Source template file
        source_template = os.path.join(os.path.dirname(__file__), '..', '..', 'templates', 'Empty.md')
        
        # Destination template file
        dest_template = os.path.join(templates_dir, 'Empty.md')
        
        # Only copy if destination doesn't exist
        if not os.path.exists(dest_template):
            if os.path.exists(source_template):
                # Copy the template file
                shutil.copy2(source_template, dest_template)
                
                # Update the timestamps in the copied file
                async with aiofiles.open(dest_template, 'r', encoding='utf-8') as f:
                    content = await f.read()
                
                # Replace the placeholder timestamps with current time
                now = datetime.now().isoformat()
                content = content.replace("created: '2024-01-01T00:00:00'", f"created: '{now}'")
                content = content.replace("modified: '2024-01-01T00:00:00'", f"modified: '{now}'")
                
                async with aiofiles.open(dest_template, 'w', encoding='utf-8') as f:
                    await f.write(content)
                
                # Commit to Git
                await self.git_service.add_and_commit(['templates/Empty.md'], 'Created Empty template')
            else:
                # Fallback to generating the template if source doesn't exist
                metadata = {
                    'id': '',
                    'title': 'Empty',
                    'type': 'file',
                    'created': datetime.now().isoformat(),
                    'modified': datetime.now().isoformat(),
                    'description': '',
                    'tags': [],
                    'links': [],
                    'task': {
                        'status': 'todo',
                        'priority': 'medium',
                        'assignee': None,
                        'dueDate': None,
                        'completedDate': None,
                        'description': ''
                    }
                }
                
                content = "# {title}\n\n{description}"
                
                file_content = await self.stringify_markdown_with_frontmatter(metadata, content)
                async with aiofiles.open(dest_template, 'w', encoding='utf-8') as f:
                    await f.write(file_content)
                
                await self.git_service.add_and_commit(['templates/Empty.md'], 'Created Empty template')
    
    async def list_templates(self) -> List[Dict[str, Any]]:
        """List all templates in the project."""
        templates_dir = os.path.join(self.project_path, 'templates')
        if not os.path.exists(templates_dir):
            return []
        
        templates = []
        for filename in os.listdir(templates_dir):
            if filename.endswith('.md'):
                template_path = os.path.join('templates', filename)
                template = await self.read_node(template_path)
                if template:
                    templates.append(template)
        
        return templates
    
    async def save_as_template(self, node_path: str, template_name: str) -> Dict[str, Any]:
        """Save a node as a template."""
        # Read the source node
        node = await self.read_node(node_path)
        if not node:
            raise FileNotFoundError(f"Node not found: {node_path}")
        
        if node['isDirectory']:
            raise ValueError("Cannot save a directory as a template")
        
        # Prepare template metadata (exclude position, links, and task states)
        template_metadata = node['metadata'].copy()
        template_metadata['title'] = template_name
        template_metadata['created'] = datetime.now().isoformat()
        template_metadata['modified'] = datetime.now().isoformat()
        
        # Remove fields that shouldn't be in templates
        template_metadata.pop('id', None)
        template_metadata.pop('position', None)
        template_metadata['links'] = []  # Clear soft links
        
        # Reset task state if present
        if 'task' in template_metadata:
            template_metadata['task'] = {
                'status': 'todo',
                'priority': template_metadata['task'].get('priority', 'medium'),
                'assignee': None,
                'dueDate': None,
                'completedDate': None,
                'description': template_metadata['task'].get('description', '')
            }
        
        # Create template
        templates_dir = os.path.join(self.project_path, 'templates')
        os.makedirs(templates_dir, exist_ok=True)
        
        sanitized_name = self.sanitize_filename(template_name)
        template_filename = sanitized_name if sanitized_name.endswith('.md') else f"{sanitized_name}.md"
        template_path = os.path.join('templates', template_filename)
        full_template_path = os.path.join(templates_dir, template_filename)
        
        # Write template file
        content = node.get('content', '')
        file_content = await self.stringify_markdown_with_frontmatter(template_metadata, content)
        async with aiofiles.open(full_template_path, 'w', encoding='utf-8') as f:
            await f.write(file_content)
        
        # Commit to Git
        await self.git_service.add_and_commit([template_path], f'Created template: {template_name}')
        
        # Return the created template
        return await self.read_node(template_path)
    
    async def create_node_from_template(self, parent_path: str, name: str, template_path: str,
                                       initial_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a new node from a template."""
        # Read the template
        template = await self.read_node(template_path)
        if not template:
            raise FileNotFoundError(f"Template not found: {template_path}")
        
        # Prepare metadata from template
        metadata = template['metadata'].copy()
        metadata['id'] = self.generate_id()
        metadata['title'] = name
        metadata['created'] = datetime.now().isoformat()
        metadata['modified'] = datetime.now().isoformat()
        
        # Apply any initial metadata overrides
        if initial_metadata:
            metadata.update(initial_metadata)
        
        # Get content from template and replace placeholders
        content = template.get('content', '')
        content = content.replace('{title}', name)
        content = content.replace('{description}', metadata.get('description', ''))
        
        # Create the node
        sanitized_name = self.sanitize_filename(name)
        filename = sanitized_name if sanitized_name.endswith('.md') else f"{sanitized_name}.md"
        
        if parent_path:
            path = os.path.join(parent_path, filename).replace('\\', '/')
            full_path = os.path.join(self.project_path, parent_path, filename)
        else:
            path = os.path.join('nodes', filename).replace('\\', '/')
            full_path = os.path.join(self.project_path, 'nodes', filename)
        
        # Ensure parent directory exists
        parent_dir = os.path.dirname(full_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        
        # Write file
        file_content = await self.stringify_markdown_with_frontmatter(metadata, content)
        async with aiofiles.open(full_path, 'w', encoding='utf-8') as f:
            await f.write(file_content)
        
        # Commit to Git
        await self.git_service.add_and_commit([path], f"Created node from template: {metadata['title']}")
        
        # Return the created node
        return await self.read_node(path)
    
    async def delete_template(self, template_name: str) -> None:
        """Delete a template."""
        template_path = os.path.join('templates', f"{template_name}.md")
        await self.delete_node(template_path)
    
    async def create_folder(self, parent_path: str, folder_name: str) -> Dict[str, Any]:
        """Create a new folder."""
        sanitized_name = self.sanitize_filename(folder_name)
        
        if parent_path:
            folder_path = os.path.join(parent_path, sanitized_name).replace('\\', '/')
            full_path = os.path.join(self.project_path, parent_path, sanitized_name)
        else:
            folder_path = sanitized_name
            full_path = os.path.join(self.project_path, sanitized_name)
        
        # Create the directory
        os.makedirs(full_path, exist_ok=True)
        
        # Create a .gitkeep file to ensure the folder is tracked by Git
        gitkeep_path = os.path.join(full_path, '.gitkeep')
        with open(gitkeep_path, 'w') as f:
            f.write('')
        
        # Commit to Git
        gitkeep_relative = os.path.join(folder_path, '.gitkeep').replace('\\', '/')
        await self.git_service.add_and_commit([gitkeep_relative], f"Created folder: {folder_name}")
        
        # Return the folder node
        return await self.read_node(folder_path) 