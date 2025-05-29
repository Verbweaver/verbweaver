"""
Templates API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.services.node_service import NodeService
from app.schemas.template import TemplateResponse, CreateTemplateData, CreateNodeFromTemplateData

router = APIRouter()


class TemplateCreate(BaseModel):
    source_node_path: str
    template_name: str


class NodeFromTemplate(BaseModel):
    template_path: str
    node_name: str
    parent_path: str = ""
    initial_metadata: dict = {}


@router.get("/{project_id}/templates", response_model=List[TemplateResponse])
async def list_templates(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all templates in a project."""
    # Check if user has access to project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    node_service = NodeService(project)
    templates = await node_service.list_templates()
    return templates


@router.post("/{project_id}/templates", response_model=TemplateResponse)
async def save_as_template(
    project_id: str,
    data: CreateTemplateData,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save a node as a template."""
    # Check if user has access to project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    node_service = NodeService(project)
    try:
        template = await node_service.save_as_template(data.source_node_id, data.template_name)
        return template
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Source node not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/nodes/from-template")
async def create_node_from_template(
    project_id: str,
    data: CreateNodeFromTemplateData,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new node from a template."""
    # Check if user has access to project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    node_service = NodeService(project)
    try:
        node = await node_service.create_node_from_template(
            data.parent_id or "",
            data.node_name,
            f"templates/{data.template_name}.md",
            data.initial_metadata
        )
        return node
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Template not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{project_id}/templates/{template_name}")
async def delete_template(
    project_id: str,
    template_name: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a template."""
    # Check if user has access to project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    node_service = NodeService(project)
    try:
        await node_service.delete_template(template_name)
        return {"message": f"Template '{template_name}' deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Template not found") 