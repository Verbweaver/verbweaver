from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from pydantic import BaseModel

router = APIRouter()


class Position(BaseModel):
    x: float
    y: float


class NodeCreate(BaseModel):
    id: str
    type: str
    position: Position
    data: dict


class NodeUpdate(BaseModel):
    position: Optional[Position] = None
    data: Optional[dict] = None


class EdgeCreate(BaseModel):
    id: str
    source: str
    target: str
    type: Optional[str] = "default"
    label: Optional[str] = None


class GraphResponse(BaseModel):
    nodes: List[dict]
    edges: List[dict]


@router.get("/projects/{project_id}/graph", response_model=GraphResponse)
async def get_graph(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the graph data for a project."""
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
    
    # For now, return mock data
    # In production, this would read from a graph database or JSON storage
    return GraphResponse(
        nodes=[
            {
                "id": "1",
                "type": "character",
                "position": {"x": 100, "y": 100},
                "data": {"label": "Main Character"}
            },
            {
                "id": "2",
                "type": "scene",
                "position": {"x": 300, "y": 100},
                "data": {"label": "Opening Scene"}
            }
        ],
        edges=[
            {
                "id": "e1-2",
                "source": "1",
                "target": "2",
                "type": "default"
            }
        ]
    )


@router.post("/projects/{project_id}/nodes")
async def create_node(
    project_id: int,
    node: NodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new node in the graph."""
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
    
    # In production, save to graph database
    # For now, just return the created node
    return {
        "id": node.id,
        "type": node.type,
        "position": node.position.dict(),
        "data": node.data
    }


@router.put("/projects/{project_id}/nodes/{node_id}")
async def update_node(
    project_id: int,
    node_id: str,
    update: NodeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a node in the graph."""
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
    
    # In production, update in graph database
    return {"message": "Node updated", "node_id": node_id}


@router.delete("/projects/{project_id}/nodes/{node_id}")
async def delete_node(
    project_id: int,
    node_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a node from the graph."""
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
    
    # In production, delete from graph database
    return {"message": "Node deleted", "node_id": node_id}


@router.post("/projects/{project_id}/edges")
async def create_edge(
    project_id: int,
    edge: EdgeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new edge in the graph."""
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
    
    # In production, save to graph database
    return {
        "id": edge.id,
        "source": edge.source,
        "target": edge.target,
        "type": edge.type,
        "label": edge.label
    }


@router.delete("/projects/{project_id}/edges/{edge_id}")
async def delete_edge(
    project_id: int,
    edge_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an edge from the graph."""
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
    
    # In production, delete from graph database
    return {"message": "Edge deleted", "edge_id": edge_id} 