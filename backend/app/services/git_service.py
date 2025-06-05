"""
Git service for repository operations
"""

import os
import subprocess
from typing import Dict, Any, List, Optional
from pathlib import Path
import aiofiles
import asyncio
import shutil # Added for directory deletion

from app.schemas.project import GitConfigBase
from app.models import Project
from app.core.config import settings


class GitService:
    """Service for Git operations"""
    
    def __init__(self, project: Project):
        """Initialize GitService with a project"""
        if not project:
            raise ValueError("Project must be provided to GitService")
        self.project = project
        self.repo_path = self._determine_repo_path()
    
    def _determine_repo_path(self) -> str:
        """Determines the repository path based on project configuration."""
        git_config = self.project.git_config or {}
        config_path = git_config.get('path')
        config_type = git_config.get('type')

        if config_type == 'local' and config_path:
            return str(Path(config_path).resolve()) # Ensure absolute path
        
        # Default to a path under GIT_PROJECTS_ROOT using project ID for uniqueness
        # This ensures consistency if user_id or project_name are not ideal for path generation
        return str(Path(settings.GIT_PROJECTS_ROOT) / str(self.project.id))
    
    async def initialize_project(self) -> GitConfigBase:
        """Initialize a git repository for the project using self.repo_path."""
        if not self.repo_path:
            raise ValueError("Repository path not set. Cannot initialize project.")

        repo_path_obj = Path(self.repo_path)
        repo_path_obj.mkdir(parents=True, exist_ok=True)
        
        # Update git_config.path if it was default or not set to the resolved absolute path
        # This ensures the project's git_config accurately reflects the actual repository location.
        if self.project.git_config is None:
            self.project.git_config = {} # Ensure git_config exists
        
        current_git_config_path = self.project.git_config.get('path')
        if not current_git_config_path or Path(current_git_config_path).resolve() != repo_path_obj.resolve():
            self.project.git_config['path'] = str(repo_path_obj.resolve())
            if not self.project.git_config.get('type'): # Set type if not present
                 self.project.git_config['type'] = 'local'


        # Initialize git repository
        try:
            subprocess.run(['git', 'init'], cwd=str(repo_path_obj), check=True, capture_output=True)
            
            # Create initial .gitignore
            gitignore_content = """# Verbweaver gitignore
.verbweaver/cache/
*.tmp
*.swp
.DS_Store
Thumbs.db
nodes/
templates/
"""
            gitignore_path = repo_path_obj / '.gitignore'
            async with aiofiles.open(gitignore_path, 'w') as f:
                await f.write(gitignore_content)
            
            # Create nodes and templates directories
            (repo_path_obj / 'nodes').mkdir(exist_ok=True)
            templates_dir = repo_path_obj / 'templates'
            templates_dir.mkdir(exist_ok=True)

            # Create Empty.md template
            empty_template_content = """---
title: Empty
type: node
description: A blank starting point.
tags: [empty, basic]
---

# Empty Node

Start your content here.
"""
            empty_template_path = templates_dir / 'Empty.md'
            async with aiofiles.open(empty_template_path, 'w') as f:
                await f.write(empty_template_content)

            # Stage and commit the .gitignore, nodes/, templates/, and Empty.md
            subprocess.run(['git', 'add', '.gitignore', 'nodes/', 'templates/', 'templates/Empty.md'], cwd=str(repo_path_obj), check=True, capture_output=True)
            subprocess.run(['git', 'commit', '-m', 'Initial commit with project structure and Empty template'], cwd=str(repo_path_obj), check=True, capture_output=True)
            
        except subprocess.CalledProcessError as e:
            print(f"Git initialization or initial commit failed: {e.stdout.decode() if e.stdout else ''} {e.stderr.decode() if e.stderr else ''}")
            # Continue anyway - project can work without git for now
        except Exception as e:
            print(f"An error occurred during project initialization: {e}")
            # Decide if to raise or handle

        # Return the potentially updated git_config
        # The caller (projects.py) will be responsible for saving this to DB if it changed.
        return GitConfigBase(**self.project.git_config)
    
    async def add_and_commit(self, files: List[str], message: str) -> None:
        """Add files and create a commit"""
        if not self.repo_path:
            print("No repo_path configured, skipping git add/commit.")
            return
        
        try:
            # Add files to staging
            for file_path in files: # Ensure we use file_path for clarity
                # Make file paths relative to repo_path for git add
                relative_file_path = Path(file_path).relative_to(self.repo_path)
                subprocess.run(['git', 'add', str(relative_file_path)], cwd=self.repo_path, check=True, capture_output=True)
            
            # Commit changes
            subprocess.run(['git', 'commit', '-m', message], cwd=self.repo_path, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            print(f"Git commit failed: {e.stdout.decode() if e.stdout else ''} {e.stderr.decode() if e.stderr else ''}")
            # Continue anyway - changes are still saved to disk
        except ValueError as e: # Can be raised by relative_to if path is not under repo_path
            print(f"Error making path relative for git add: {e}")
        except Exception as e:
            print(f"An unexpected error occurred during add_and_commit: {e}")
    
    async def remove_and_commit(self, files: List[str], message: str) -> None:
        """Remove files and create a commit"""
        if not self.repo_path:
            print("No repo_path configured, skipping git rm/commit.")
            return
        
        try:
            # Remove files from git
            for file_path in files:
                relative_file_path = Path(file_path).relative_to(self.repo_path)
                subprocess.run(['git', 'rm', str(relative_file_path)], cwd=self.repo_path, check=True, capture_output=True)
            
            # Commit changes
            subprocess.run(['git', 'commit', '-m', message], cwd=self.repo_path, check=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            print(f"Git remove failed: {e.stdout.decode() if e.stdout else ''} {e.stderr.decode() if e.stderr else ''}")
        except ValueError as e:
            print(f"Error making path relative for git rm: {e}")
        except Exception as e:
            print(f"An unexpected error occurred during remove_and_commit: {e}")
    
    async def delete_project_repository(self) -> None:
        """Delete the project's git repository from the filesystem."""
        if not self.repo_path or not Path(self.repo_path).exists():
            print(f"Repository path {self.repo_path} not found or not set. Skipping deletion.")
            return

        try:
            # Make sure we are not deleting something outside GIT_PROJECTS_ROOT or a configured custom path
            # This is a basic safety check.
            is_default_location = settings.GIT_PROJECTS_ROOT in self.repo_path
            is_configured_path = self.project.git_config and self.project.git_config.get('path') == self.repo_path

            if not (is_default_location or is_configured_path):
                 print(f"Error: Attempting to delete a repository outside of expected locations: {self.repo_path}")
                 # Potentially raise an exception here or just log and return
                 # For now, just preventing deletion.
                 return

            shutil.rmtree(self.repo_path)
            print(f"Successfully deleted repository at {self.repo_path}")
        except OSError as e:
            print(f"Error deleting repository at {self.repo_path}: {e}")
            # Potentially raise an exception or handle more gracefully
    
    async def delete_repository(self, git_config: Dict[str, Any]):
        """Delete a git repository"""
        # TODO: Implement repository deletion if needed
        pass 