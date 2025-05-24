from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import aiofiles
from pathlib import Path

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.core.config import settings
from pydantic import BaseModel

router = APIRouter()


class FileNode(BaseModel):
    name: str
    path: str
    type: str  # 'file' or 'directory'
    children: Optional[List['FileNode']] = None


class FileContent(BaseModel):
    content: str


class FileSave(BaseModel):
    path: str
    content: str


def get_project_path(project_id: int) -> Path:
    """Get the filesystem path for a project."""
    return Path(settings.PROJECTS_DIR) / f"project_{project_id}"


def build_file_tree(root_path: Path, relative_to: Path) -> List[FileNode]:
    """Build a file tree structure from a directory."""
    items = []
    
    for item in sorted(root_path.iterdir()):
        if item.name.startswith('.'):
            continue  # Skip hidden files
            
        relative_path = str(item.relative_to(relative_to))
        
        if item.is_dir():
            children = build_file_tree(item, relative_to)
            items.append(FileNode(
                name=item.name,
                path=relative_path,
                type='directory',
                children=children
            ))
        else:
            items.append(FileNode(
                name=item.name,
                path=relative_path,
                type='file'
            ))
    
    return items


@router.get("/projects/{project_id}/files", response_model=List[FileNode])
async def get_file_tree(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the file tree for a project."""
    # Check project access
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project_path = get_project_path(project_id)
    
    if not project_path.exists():
        return []
    
    return build_file_tree(project_path, project_path)


@router.get("/projects/{project_id}/files/{file_path:path}")
async def get_file_content(
    project_id: int,
    file_path: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the content of a file."""
    # Check project access
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project_path = get_project_path(project_id)
    full_path = project_path / file_path
    
    # Security: ensure the path is within the project directory
    try:
        full_path.resolve().relative_to(project_path.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    if not full_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path is not a file"
        )
    
    async with aiofiles.open(full_path, 'r') as f:
        content = await f.read()
    
    return FileContent(content=content)


@router.post("/projects/{project_id}/files/save")
async def save_file(
    project_id: int,
    file_data: FileSave,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a file."""
    # Check project access
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project_path = get_project_path(project_id)
    full_path = project_path / file_data.path
    
    # Security: ensure the path is within the project directory
    try:
        full_path.resolve().relative_to(project_path.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Create parent directories if they don't exist
    full_path.parent.mkdir(parents=True, exist_ok=True)
    
    async with aiofiles.open(full_path, 'w') as f:
        await f.write(file_data.content)
    
    return {"message": "File saved successfully", "path": file_data.path}


@router.post("/projects/{project_id}/files/create")
async def create_file(
    project_id: int,
    file_path: str,
    is_directory: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new file or directory."""
    # Check project access
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project_path = get_project_path(project_id)
    full_path = project_path / file_path
    
    # Security: ensure the path is within the project directory
    try:
        full_path.resolve().relative_to(project_path.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    if full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File or directory already exists"
        )
    
    if is_directory:
        full_path.mkdir(parents=True, exist_ok=True)
    else:
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.touch()
    
    return {"message": "Created successfully", "path": file_path}


@router.delete("/projects/{project_id}/files/{file_path:path}")
async def delete_file(
    project_id: int,
    file_path: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a file or directory."""
    # Check project access
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    project_path = get_project_path(project_id)
    full_path = project_path / file_path
    
    # Security: ensure the path is within the project directory
    try:
        full_path.resolve().relative_to(project_path.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File or directory not found"
        )
    
    if full_path.is_dir():
        import shutil
        shutil.rmtree(full_path)
    else:
        full_path.unlink()
    
    return {"message": "Deleted successfully", "path": file_path} 