"""
Projects API endpoints
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
# import os # No longer directly needed here

from app.database import get_db
from app.models import Project
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse # GitConfigBase removed as initialize_project returns it
from app.services.git_service import GitService
# from app.services.node_service import NodeService # No longer needed
from app.core.security import get_current_user
from app.models import User

router = APIRouter()
logger = logging.getLogger(__name__)

# get_git_service factory is removed

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
    current_user: User = Depends(get_current_user)
):
    """Create a new project"""
    logger.info(f"Creating project: {project_data.name} for user {current_user.id}")
    
    # 1. Create Project DB model instance with initial git_config
    db_project = Project(
        name=project_data.name,
        description=project_data.description,
        user_id=current_user.id,
        git_config=project_data.git_config.dict() if project_data.git_config else {},
        settings=project_data.settings or {}
    )
    
    # 2. Save to DB to get an ID
    db.add(db_project)
    await db.commit()
    # 3. Refresh to get all DB-generated fields (like ID, created_at)
    await db.refresh(db_project)
    logger.info(f"Project '{db_project.name}' (ID: {db_project.id}) record created in DB. Initial git_config: {db_project.git_config}")

    # 4. Instantiate GitService with the persisted project model (which now has an ID)
    git_service = GitService(project=db_project)
    
    # 5. Initialize the project repository. This creates files/folders and may update git_config 
    #    (e.g., resolve to an absolute path, or set a default path if none was provided).
    #    initialize_project now returns a GitConfigBase schema object.
    updated_git_config_schema = await git_service.initialize_project()
    
    # 6. If git_config was changed by the service (e.g. path resolved or defaulted),
    #    update the project in the database.
    if db_project.git_config != updated_git_config_schema.dict():
        logger.info(f"Git config changed during initialization. Old: {db_project.git_config}, New: {updated_git_config_schema.dict()}")
        db_project.git_config = updated_git_config_schema.dict()
        await db.commit()
        await db.refresh(db_project) # Refresh again after update
        logger.info(f"Project '{db_project.name}' (ID: {db_project.id}) git_config updated in DB.")
    else:
        logger.info(f"Project '{db_project.name}' (ID: {db_project.id}) git_config unchanged after repo initialization.")

    # NodeService calls for creating initial folders/templates are removed 
    # as GitService.initialize_project() now handles this.
    
    logger.info(f"Project '{db_project.name}' (ID: {db_project.id}) fully created. Final repo path: {db_project.git_config.get('path')}")
    return db_project


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
    current_user: User = Depends(get_current_user)
):
    """Delete a project"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project_model = result.scalar_one_or_none()
    
    if not project_model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Instantiate GitService with the fetched project model to get correct repo_path
    git_service_instance = GitService(project=project_model)
    await git_service_instance.delete_project_repository()
    
    await db.delete(project_model)
    await db.commit()
    
    logger.info(f"Project '{project_model.name}' (ID: {project_model.id}) and its repository deleted successfully.")
    return {"message": "Project deleted successfully"} 