from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.services.node_service import NodeService
from pydantic import BaseModel

router = APIRouter()


class Position(BaseModel):
    x: float
    y: float


class NodeCreate(BaseModel):
    parent_path: str = ""
    name: str
    type: str
    position: Optional[Position] = None
    data: Optional[dict] = None


class NodeUpdate(BaseModel):
    position: Optional[Position] = None
    data: Optional[dict] = None


class EdgeCreate(BaseModel):
    source: str
    target: str
    type: Optional[str] = "soft"
    label: Optional[str] = None


class FolderCreate(BaseModel):
    parent_path: str = "nodes"
    folder_name: str


class GraphResponse(BaseModel):
    nodes: List[dict]
    edges: List[dict]


@router.get("/projects/{project_id}/graph", response_model=GraphResponse)
async def get_graph(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the graph data for a project."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Use NodeService to get actual nodes from Git
    node_service = NodeService(project)
    nodes_data = await node_service.list_nodes()
    
    # Convert to graph format
    nodes = []
    edges = []
    
    for node_data in nodes_data:
        # Create node for graph
        nodes.append({
            "id": node_data["path"],
            "type": node_data["metadata"].get("type", "file"),
            "position": node_data["metadata"].get("position", {"x": 100, "y": 100}),
            "data": {
                "label": node_data["metadata"].get("title", node_data["name"]),
                "metadata": node_data["metadata"],
                "hasTask": node_data["hasTask"],
                "taskStatus": node_data["taskStatus"],
                "isDirectory": node_data["isDirectory"],
                "isMarkdown": node_data["isMarkdown"]
            }
        })
        
        # Create hard link edges (parent-child)
        if node_data["hardLinks"]["parent"]:
            edges.append({
                "id": f"hard-{node_data['hardLinks']['parent']}-{node_data['path']}",
                "source": node_data["hardLinks"]["parent"],
                "target": node_data["path"],
                "type": "hard",
                "label": "contains"
            })
        
        # Create soft link edges
        for target_id in node_data["softLinks"]:
            # Find the target node by ID
            target_node = next((n for n in nodes_data if n["metadata"]["id"] == target_id), None)
            if target_node:
                edges.append({
                    "id": f"soft-{node_data['path']}-{target_node['path']}",
                    "source": node_data["path"],
                    "target": target_node["path"],
                    "type": "soft",
                    "label": None
                })
    
    return GraphResponse(nodes=nodes, edges=edges)


@router.get("/projects/{project_id}/nodes")
async def list_nodes(
    project_id: int,
    directory: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all nodes in a project."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    node_service = NodeService(project)
    nodes = await node_service.list_nodes(directory)
    return {"nodes": nodes}


@router.post("/projects/{project_id}/nodes")
async def create_node(
    project_id: int,
    node: NodeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new node in the graph."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Prepare initial metadata
    initial_metadata = {}
    if node.position:
        initial_metadata["position"] = node.position.dict()
    if node.data:
        initial_metadata.update(node.data)
    
    # Create node using NodeService
    node_service = NodeService(project)
    try:
        created_node = await node_service.create_node(
            parent_path=node.parent_path,
            name=node.name,
            node_type=node.type,
            initial_metadata=initial_metadata
        )
        return created_node
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/projects/{project_id}/nodes/{node_path:path}")
async def update_node(
    project_id: int,
    node_path: str,
    update: NodeUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a node in the graph."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Prepare metadata updates
    metadata_updates = {}
    if update.position:
        metadata_updates["position"] = update.position.dict()
    if update.data:
        metadata_updates.update(update.data)
    
    # Update node using NodeService
    node_service = NodeService(project)
    try:
        updated_node = await node_service.update_node(
            path=node_path,
            metadata_updates=metadata_updates
        )
        return updated_node
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/projects/{project_id}/nodes/{node_path:path}")
async def delete_node(
    project_id: int,
    node_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a node from the graph."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Delete node using NodeService
    node_service = NodeService(project)
    try:
        await node_service.delete_node(node_path)
        return {"message": "Node deleted", "node_path": node_path}
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/projects/{project_id}/edges")
async def create_edge(
    project_id: int,
    edge: EdgeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new edge in the graph."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Only handle soft links (hard links are automatic based on directory structure)
    if edge.type != "soft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only soft links can be created manually"
        )
    
    # Create soft link using NodeService
    node_service = NodeService(project)
    try:
        await node_service.create_soft_link(edge.source, edge.target)
        
        # Get the nodes to return edge data
        source_node = await node_service.read_node(edge.source)
        target_node = await node_service.read_node(edge.target)
        
        if not source_node or not target_node:
            raise FileNotFoundError("Source or target node not found")
        
        return {
            "id": f"soft-{edge.source}-{edge.target}",
            "source": edge.source,
            "target": edge.target,
            "type": "soft",
            "label": edge.label
        }
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/projects/{project_id}/edges/{edge_id}")
async def delete_edge(
    project_id: int,
    edge_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an edge from the graph."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Parse edge ID to get source and target
    if not edge_id.startswith("soft-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only soft links can be deleted"
        )
    
    # Extract source and target from edge ID
    # Format: soft-source-target
    parts = edge_id.split("-", 2)
    if len(parts) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid edge ID format"
        )
    
    source_path = parts[1]
    target_path = parts[2]
    
    # Delete soft link using NodeService
    node_service = NodeService(project)
    try:
        # Get target node to find its ID
        target_node = await node_service.read_node(target_path)
        if not target_node:
            raise FileNotFoundError("Target node not found")
        
        await node_service.remove_soft_link(source_path, target_node["metadata"]["id"])
        return {"message": "Edge deleted", "edge_id": edge_id}
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/projects/{project_id}/folders")
async def create_folder(
    project_id: int,
    folder_data: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new folder in the graph."""
    # Check project access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == current_user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Create folder using NodeService
    node_service = NodeService(project)
    try:
        folder_node = await node_service.create_folder(
            parent_path=folder_data.parent_path,
            folder_name=folder_data.folder_name
        )
        return folder_node
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) 