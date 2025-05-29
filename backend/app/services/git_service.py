"""
Git service for repository operations
"""

import os
import subprocess
from typing import Dict, Any, List, Optional
from pathlib import Path
import aiofiles
import asyncio

from app.schemas.project import GitConfigBase
from app.models import Project
from app.core.config import settings


class GitService:
    """Service for Git operations"""
    
    def __init__(self, project: Optional[Project] = None):
        """Initialize GitService with optional project"""
        self.project = project
        if project:
            # Determine repository path based on project configuration
            git_config = project.git_config or {}
            if git_config.get('type') == 'local' and git_config.get('path'):
                self.repo_path = git_config['path']
            else:
                # Default to a path under GIT_PROJECTS_ROOT
                self.repo_path = os.path.join(settings.GIT_PROJECTS_ROOT, str(project.id))
        else:
            self.repo_path = None
    
    async def initialize_project(
        self,
        project_name: str,
        git_config: GitConfigBase,
        user_id: str
    ) -> GitConfigBase:
        """Initialize a git repository for a project"""
        # Determine the repository path
        if git_config.type == 'local' and git_config.path:
            repo_path = git_config.path
        else:
            # Create a default path based on user and project
            repo_path = os.path.join(settings.GIT_PROJECTS_ROOT, user_id, project_name.replace(' ', '_'))
            git_config.path = repo_path
        
        # Create directory if it doesn't exist
        os.makedirs(repo_path, exist_ok=True)
        
        # Initialize git repository
        try:
            subprocess.run(['git', 'init'], cwd=repo_path, check=True, capture_output=True)
            
            # Create initial .gitignore
            gitignore_content = """# Verbweaver gitignore
.verbweaver/cache/
*.tmp
*.swp
.DS_Store
Thumbs.db
"""
            gitignore_path = os.path.join(repo_path, '.gitignore')
            async with aiofiles.open(gitignore_path, 'w') as f:
                await f.write(gitignore_content)
            
            # Stage and commit the .gitignore
            subprocess.run(['git', 'add', '.gitignore'], cwd=repo_path, check=True, capture_output=True)
            subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=repo_path, check=True, capture_output=True)
            
        except subprocess.CalledProcessError as e:
            # Git might not be installed or initialization failed
            print(f"Git initialization failed: {e}")
            # Continue anyway - project can work without git
        
        return git_config
    
    async def add_and_commit(self, files: List[str], message: str) -> None:
        """Add files and create a commit"""
        if not self.repo_path:
            return
        
        try:
            # Add files to staging
            for file in files:
                subprocess.run(['git', 'add', file], cwd=self.repo_path, check=True, capture_output=True)
            
            # Commit changes
            subprocess.run(['git', 'commit', '-m', message], cwd=self.repo_path, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            print(f"Git commit failed: {e}")
            # Continue anyway - changes are still saved to disk
    
    async def remove_and_commit(self, files: List[str], message: str) -> None:
        """Remove files and create a commit"""
        if not self.repo_path:
            return
        
        try:
            # Remove files from git
            for file in files:
                subprocess.run(['git', 'rm', file], cwd=self.repo_path, check=True, capture_output=True)
            
            # Commit changes
            subprocess.run(['git', 'commit', '-m', message], cwd=self.repo_path, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            print(f"Git remove failed: {e}")
            # Continue anyway - files are still deleted from disk
    
    async def delete_repository(self, git_config: Dict[str, Any]):
        """Delete a git repository"""
        # TODO: Implement repository deletion if needed
        pass 