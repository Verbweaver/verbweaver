"""
Editor endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
import os
import re
from pathlib import Path

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.services.node_service import NodeService
from pydantic import BaseModel
try:
    # Optional: used to respect .gitignore patterns
    from pathspec import PathSpec
    from pathspec.patterns import GitWildMatchPattern
except Exception:  # pragma: no cover
    PathSpec = None  # type: ignore
    GitWildMatchPattern = None  # type: ignore

router = APIRouter()


class FileCreate(BaseModel):
    path: str
    content: str = ""


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


@router.get("/{project_id}/files/{file_path:path}")
async def read_file(
    project_id: str,
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


@router.put("/{project_id}/files/{file_path:path}")
async def write_file(
    project_id: str,
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


@router.post("/{project_id}/files")
async def create_file(
    project_id: str,
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
    
    # Extract parent path and name from full path
    parent_path = os.path.dirname(file_create.path)
    if parent_path == ".":
        parent_path = ""
    name = os.path.basename(file_create.path)
    
    # Create file using NodeService
    node_service = NodeService(project)
    try:
        created_node = await node_service.create_node(
            parent_path=parent_path,
            name=name,
            node_type="file",
            initial_metadata={},
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


@router.delete("/{project_id}/files/{file_path:path}")
async def delete_file(
    project_id: str,
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


@router.get("/{project_id}/tree")
async def get_file_tree(
    project_id: str,
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


class SearchRequest(BaseModel):
    query: str
    regex: bool = False
    case_sensitive: bool = False


@router.post("/{project_id}/search")
async def search_files(
    project_id: str,
    req: SearchRequest | None = Body(default=None),
    query: str | None = None,
    regex: bool | None = None,
    case_sensitive: bool | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Search across the entire project tree for files containing the query.

    - Respects .gitignore if present
    - Skips hidden folders and the .git directory
    - Skips binary files (simple heuristic on first 4KB)
    - Supports plain text or regex query and case sensitivity
    """
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

    # Coalesce inputs from either JSON body or query params
    _query = (req.query if req else None) or query or ""
    _regex = (req.regex if req else None)
    if _regex is None:
        _regex = bool(regex)
    _case = (req.case_sensitive if req else None)
    if _case is None:
        _case = bool(case_sensitive)

    # Determine project path
    project_path = (project.git_config or {}).get('path')
    if not project_path:
        raise HTTPException(status_code=404, detail="Project path not configured")
    project_path = os.path.abspath(os.path.normpath(project_path))
    if not os.path.isdir(project_path):
        raise HTTPException(status_code=404, detail="Project directory not found")

    # Prepare .gitignore matcher if library available
    spec = None
    gitignore_file = os.path.join(project_path, '.gitignore')
    if PathSpec is not None and os.path.exists(gitignore_file):
        try:
            with open(gitignore_file, 'r', encoding='utf-8', errors='ignore') as f:
                patterns = f.read().splitlines()
            spec = PathSpec.from_lines(GitWildMatchPattern, patterns)
        except Exception:
            spec = None

    def is_ignored(rel_path: str) -> bool:
        # rel_path should be POSIX-style for pathspec
        if not rel_path:
            return False
        posix = rel_path.replace('\\', '/')
        if spec is None:
            return False
        return spec.match_file(posix)

    def is_binary_file(abs_path: str) -> bool:
        try:
            with open(abs_path, 'rb') as bf:
                sample = bf.read(4096)
            if b'\x00' in sample:
                return True
            # Heuristic: if a significant portion are non-text bytes
            text_chars = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x7F)))
            non_text = sum(1 for b in sample if b not in text_chars)
            return (len(sample) > 0 and non_text / max(1, len(sample)) > 0.30)
        except Exception:
            # If unreadable, treat as binary to be safe
            return True

    # Compile matcher
    if _regex:
        flags = 0
        if not _case:
            flags |= re.IGNORECASE
        try:
            pattern = re.compile(_query, flags)
        except re.error as e:
            raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")
    else:
        needle = _query if _case else _query.lower()

    results: List[Dict[str, Any]] = []

    for root, dirs, files in os.walk(project_path):
        # Prune hidden and .git dirs early
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '.git']

        rel_root = os.path.relpath(root, project_path)
        if rel_root == '.':
            rel_root = ''

        # Skip ignored directories
        if rel_root and is_ignored(rel_root + '/'):
            dirs[:] = []
            continue

        for fname in files:
            if fname.startswith('.'):  # skip hidden files
                continue
            rel_path = os.path.join(rel_root, fname).replace('\\', '/') if rel_root else fname

            # Skip ignored files
            if is_ignored(rel_path):
                continue

            abs_path = os.path.join(project_path, rel_path)

            # Skip likely binary files
            if is_binary_file(abs_path):
                continue

            # Read and search
            try:
                with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
            except Exception:
                continue

            match_count = 0
            if _regex:
                match_count = len(pattern.findall(content))
            else:
                haystack = content if _case else content.lower()
                if needle:
                    # Count non-overlapping occurrences
                    match_count = haystack.count(needle)

            if match_count > 0:
                results.append({
                    'path': rel_path,
                    'count': match_count
                })

    # Sort results for stable ordering
    results.sort(key=lambda r: r['path'])
    return { 'results': results, 'count': len(results) }
