"""
Projects API endpoints
"""

from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
import os
import yaml
from pathlib import Path
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


@router.get("/{project_id}/settings")
async def get_project_settings(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get project settings from the git repository"""
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
    
    # Get project path
    project_path = project.git_config.get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    
    # Read settings from git repository
    settings_file = Path(project_path) / "verbweaver-settings.yaml"
    if not settings_file.exists():
        return {"settings": {}}
    
    try:
        with open(settings_file, 'r', encoding='utf-8') as f:
            settings = yaml.safe_load(f)
        return {"settings": settings or {}}
    except Exception as e:
        logger.error(f"Error reading project settings: {e}")
        raise HTTPException(status_code=500, detail="Error reading project settings")


@router.put("/{project_id}/settings")
async def update_project_settings(
    project_id: str,
    settings: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update project settings in the git repository"""
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
    
    # Get project path
    project_path = project.git_config.get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    
    # Write settings to git repository
    settings_file = Path(project_path) / "verbweaver-settings.yaml"
    try:
        with open(settings_file, 'w', encoding='utf-8') as f:
            yaml.dump(settings, f, default_flow_style=False, allow_unicode=True)
        
        # Commit the settings file to git
        git_service = GitService(project=project)
        await git_service.commit_changes("Update project settings", [str(settings_file)])
        
        return {"message": "Project settings updated successfully"}
    except Exception as e:
        logger.error(f"Error updating project settings: {e}")
        raise HTTPException(status_code=500, detail="Error updating project settings")


@router.get("/{project_id}/settings/compiler")
async def get_compiler_settings(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get compiler-specific settings"""
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
    
    # Get project path
    project_path = project.git_config.get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    
    # Read settings from git repository
    settings_file = Path(project_path) / "verbweaver-settings.yaml"
    if not settings_file.exists():
        return {"compiler": {"defaultTemplates": {}}}
    
    try:
        with open(settings_file, 'r', encoding='utf-8') as f:
            settings = yaml.safe_load(f)
        
        compiler_settings = settings.get('compiler', {})
        return {"compiler": compiler_settings}
    except Exception as e:
        logger.error(f"Error reading compiler settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error reading compiler settings"
        )


@router.get("/{project_id}/settings/tasks")
async def get_tasks_settings(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get tasks-specific settings (Kanban columns). Falls back to legacy 'threads' key."""
    # Get project to verify access
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
    
    # Get project path
    git_service = GitService(project=project)
    project_path = git_service.repo_path
    
    if not project_path or not os.path.exists(project_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project directory not found"
        )
    
    # Read settings file
    settings_file = Path(project_path) / "verbweaver-settings.yaml"
    
    if not settings_file.exists():
        # Return default columns if no settings file exists
        default_columns = [
            {"id": "todo", "title": "Todo", "color": "bg-blue-500"},
            {"id": "in-progress", "title": "In Progress", "color": "bg-amber-500"},
            {"id": "review", "title": "Review", "color": "bg-purple-500"},
            {"id": "done", "title": "Done", "color": "bg-green-500"}
        ]
        return {"tasks": {"columns": default_columns, "defaultColumnId": default_columns[0]['id']}}
    
    try:
        with open(settings_file, 'r', encoding='utf-8') as f:
            settings = yaml.safe_load(f) or {}
        
        tasks_settings = settings.get('tasks') or settings.get('threads', {})
        columns = tasks_settings.get('columns', [])
        
        # Return default columns if none are configured
        if not columns:
            default_columns = [
                {"id": "todo", "title": "Todo", "color": "bg-blue-500"},
                {"id": "in-progress", "title": "In Progress", "color": "bg-amber-500"},
                {"id": "review", "title": "Review", "color": "bg-purple-500"},
                {"id": "done", "title": "Done", "color": "bg-green-500"}
            ]
            return {"tasks": {"columns": default_columns, "defaultColumnId": default_columns[0]['id']}}
        
        return {"tasks": {"columns": columns, "defaultColumnId": tasks_settings.get('defaultColumnId', columns[0]['id'] if columns else None)}}
        
    except Exception as e:
        logger.error(f"Error reading tasks settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error reading tasks settings"
        )


@router.get("/{project_id}/settings/threads")
async def get_threads_settings_legacy(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Legacy endpoint: proxy to tasks settings for backward compatibility."""
    resp = await get_tasks_settings(project_id, db, current_user)
    # Map tasks -> threads shape
    return {"threads": resp.get("tasks", {})}

@router.put("/{project_id}/settings/tasks")
async def update_tasks_settings(
    project_id: str,
    tasks_settings: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update tasks-specific settings (Kanban columns). Also mirror to legacy 'threads' key."""
    # Get project to verify access
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
    
    # Get project path
    git_service = GitService(project=project)
    project_path = git_service.repo_path
    
    if not project_path or not os.path.exists(project_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project directory not found"
        )
    
    # Read existing settings or create new
    settings_file = Path(project_path) / "verbweaver-settings.yaml"
    
    try:
        if settings_file.exists():
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = yaml.safe_load(f) or {}
        else:
            settings = {}
        
        # Update tasks settings and mirror to legacy
        settings['tasks'] = tasks_settings
        settings['threads'] = tasks_settings
        
        # Write back to file
        with open(settings_file, 'w', encoding='utf-8') as f:
            yaml.dump(settings, f, default_flow_style=False, allow_unicode=True)
        
        # Commit changes to git
        await git_service.commit_changes("Update tasks settings", [str(settings_file)])
        
        return {"message": "Tasks settings updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating tasks settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating tasks settings"
        )

@router.put("/{project_id}/settings/threads")
async def update_threads_settings_legacy(
    project_id: str,
    threads_settings: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Legacy endpoint: writes to tasks and threads keys for compatibility."""
    return await update_tasks_settings(project_id, threads_settings, db, current_user)


@router.put("/{project_id}/settings/compiler")
async def update_compiler_settings(
    project_id: str,
    compiler_settings: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update compiler-specific settings"""
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
    
    # Get project path
    project_path = project.git_config.get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    
    # Read existing settings
    settings_file = Path(project_path) / "verbweaver-settings.yaml"
    settings = {}
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = yaml.safe_load(f) or {}
        except Exception as e:
            logger.error(f"Error reading existing settings: {e}")
    
    # Update compiler settings
    settings['compiler'] = compiler_settings
    
    # Write updated settings
    try:
        with open(settings_file, 'w', encoding='utf-8') as f:
            yaml.dump(settings, f, default_flow_style=False, allow_unicode=True)
        
        # Commit the settings file to git
        git_service = GitService(project=project)
        await git_service.commit_changes("Update compiler settings", [str(settings_file)])
        
        return {"message": "Compiler settings updated successfully"}
    except Exception as e:
        logger.error(f"Error updating compiler settings: {e}")
        raise HTTPException(status_code=500, detail="Error updating compiler settings") 