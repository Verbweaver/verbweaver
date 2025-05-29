"""
Projects API endpoints
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
import os

from app.database import get_db
from app.models import Project
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.git_service import GitService
from app.services.node_service import NodeService
from app.core.security import get_current_user
from app.models import User

router = APIRouter()
logger = logging.getLogger(__name__)


def get_git_service() -> GitService:
    """Dependency to get GitService instance"""
    return GitService()


@router.get("/", response_model=List[ProjectResponse])
async def get_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
):
    """Get all projects for the current user"""
    result = await db.execute(
        select(Project)
        .where(Project.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
    )
    projects = result.scalars().all()
    return projects


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific project"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project


@router.post("/", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    git_service: GitService = Depends(get_git_service)
):
    """Create a new project"""
    logger.info(f"Creating project: {project_data.name}")
    
    # Initialize git repository
    git_config = await git_service.initialize_project(
        project_name=project_data.name,
        git_config=project_data.git_config,
        user_id=current_user.id
    )
    
    # Create project in database
    project = Project(
        name=project_data.name,
        description=project_data.description,
        user_id=current_user.id,
        git_config=git_config.dict(),
        settings=project_data.settings or {}
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    logger.info(f"Project created in database: {project.id}")
    
    # Create default folders and Empty template
    node_service = NodeService(project)
    
    try:
        # Create nodes folder
        logger.info("Creating nodes folder...")
        await node_service.create_folder("", "nodes")
        logger.info("Nodes folder created successfully")
        
        # Create Empty template
        logger.info("Creating Empty template...")
        logger.info(f"Project path: {node_service.project_path}")
        logger.info(f"Git repository path: {git_service.repo_path}")
        
        await node_service.create_empty_template()
        
        # Verify template was created
        template_path = os.path.join(node_service.project_path, "templates", "Empty.md")
        if os.path.exists(template_path):
            logger.info(f"Empty template created successfully at: {template_path}")
        else:
            logger.error(f"Empty template was NOT created at: {template_path}")
    except Exception as e:
        logger.error(f"Error creating default project structure: {e}", exc_info=True)
        # Don't fail the project creation if template creation fails
    
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_update: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a project"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update fields
    for field, value in project_update.dict(exclude_unset=True).items():
        setattr(project, field, value)
    
    await db.commit()
    await db.refresh(project)
    
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    git_service: GitService = Depends(get_git_service)
):
    """Delete a project"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Delete git repository (optional, based on user preference)
    # await git_service.delete_repository(project.git_config)
    
    await db.delete(project)
    await db.commit()
    
    return {"message": "Project deleted successfully"} 