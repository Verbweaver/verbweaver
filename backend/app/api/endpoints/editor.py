from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import os

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.services.node_service import NodeService
from pydantic import BaseModel

router = APIRouter()


class FileCreate(BaseModel):
    path: str
    name: str
    content: str = ""
    metadata: Optional[dict] = None


class FileUpdate(BaseModel):
    content: Optional[str] = None
    metadata: Optional[dict] = None


class FileContent(BaseModel):
    path: str
    name: str
    content: str
    metadata: dict
    is_directory: bool
    is_markdown: bool


class DirectoryContent(BaseModel):
    path: str
    items: List[dict]


@router.get("/projects/{project_id}/files/{file_path:path}")
async def read_file(
    project_id: int,
    file_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Read a file's content."""
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
    
    # Read file using NodeService
    node_service = NodeService(project)
    try:
        node = await node_service.read_node(file_path)
        if not node:
            raise FileNotFoundError(f"File not found: {file_path}")
        
        if node["isDirectory"]:
            # Return directory contents
            children = []
            for child_path in node["hardLinks"]["children"]:
                child_node = await node_service.read_node(child_path)
                if child_node:
                    children.append({
                        "path": child_node["path"],
                        "name": child_node["name"],
                        "type": "directory" if child_node["isDirectory"] else "file",
                        "metadata": child_node["metadata"]
                    })
            
            return DirectoryContent(
                path=file_path,
                items=children
            )
        else:
            # Return file content
            return FileContent(
                path=node["path"],
                name=node["name"],
                content=node.get("content", ""),
                metadata=node["metadata"],
                is_directory=False,
                is_markdown=node["isMarkdown"]
            )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put("/projects/{project_id}/files/{file_path:path}")
async def write_file(
    project_id: int,
    file_path: str,
    file_update: FileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Write/update a file's content."""
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
    
    # Update file using NodeService
    node_service = NodeService(project)
    try:
        updated_node = await node_service.update_node(
            path=file_path,
            metadata_updates=file_update.metadata,
            content=file_update.content
        )
        
        return FileContent(
            path=updated_node["path"],
            name=updated_node["name"],
            content=updated_node.get("content", ""),
            metadata=updated_node["metadata"],
            is_directory=updated_node["isDirectory"],
            is_markdown=updated_node["isMarkdown"]
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/projects/{project_id}/files")
async def create_file(
    project_id: int,
    file_create: FileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new file."""
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
    
    # Extract parent path from full path
    parent_path = os.path.dirname(file_create.path)
    if parent_path == ".":
        parent_path = ""
    
    # Create file using NodeService
    node_service = NodeService(project)
    try:
        # Determine node type from metadata or default to "file"
        node_type = "file"
        if file_create.metadata and "type" in file_create.metadata:
            node_type = file_create.metadata["type"]
        
        created_node = await node_service.create_node(
            parent_path=parent_path,
            name=file_create.name,
            node_type=node_type,
            initial_metadata=file_create.metadata,
            initial_content=file_create.content
        )
        
        return FileContent(
            path=created_node["path"],
            name=created_node["name"],
            content=created_node.get("content", ""),
            metadata=created_node["metadata"],
            is_directory=created_node["isDirectory"],
            is_markdown=created_node["isMarkdown"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/projects/{project_id}/files/{file_path:path}")
async def delete_file(
    project_id: int,
    file_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a file."""
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
    
    # Delete file using NodeService
    node_service = NodeService(project)
    try:
        await node_service.delete_node(file_path)
        return {"message": "File deleted successfully", "path": file_path}
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/projects/{project_id}/tree")
async def get_file_tree(
    project_id: int,
    path: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the file tree structure for a project."""
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
    
    # Get all nodes
    node_service = NodeService(project)
    all_nodes = await node_service.list_nodes(path)
    
    # Build tree structure
    def build_tree(nodes, parent_path=""):
        tree = []
        for node in nodes:
            # Only include direct children of parent_path
            node_parent = node["hardLinks"]["parent"] or ""
            if node_parent == parent_path:
                item = {
                    "path": node["path"],
                    "name": node["name"],
                    "type": "directory" if node["isDirectory"] else "file",
                    "metadata": node["metadata"]
                }
                
                if node["isDirectory"]:
                    # Recursively build children
                    item["children"] = build_tree(nodes, node["path"])
                
                tree.append(item)
        
        return sorted(tree, key=lambda x: (x["type"] != "directory", x["name"].lower()))
    
    tree = build_tree(all_nodes, path)
    return {"tree": tree}


@router.post("/projects/{project_id}/search")
async def search_files(
    project_id: int,
    query: str,
    file_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Search for files in the project."""
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
    
    # Search using NodeService
    node_service = NodeService(project)
    results = await node_service.search_nodes(
        query=query,
        node_type=file_type
    )
    
    # Format results
    formatted_results = []
    for node in results:
        formatted_results.append({
            "path": node["path"],
            "name": node["name"],
            "type": "directory" if node["isDirectory"] else "file",
            "metadata": node["metadata"],
            "content_preview": node.get("content", "")[:200] if node.get("content") else None
        })
    
    return {"results": formatted_results, "count": len(formatted_results)} 