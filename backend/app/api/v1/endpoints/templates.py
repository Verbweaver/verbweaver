from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import os
from pathlib import Path
from app.core.config import settings
from app.services.template_service import TemplateService
from app.core.security import get_current_user
from app.models import User

router = APIRouter()


def _ensure_dirs() -> None:
    Path(settings.GLOBAL_TEMPLATES_DIR).mkdir(parents=True, exist_ok=True)
    # Subfolders for organization
    Path(settings.GLOBAL_TEMPLATES_DIR, 'project').mkdir(exist_ok=True)
    Path(settings.GLOBAL_TEMPLATES_DIR, 'templates').mkdir(exist_ok=True)
    Path(settings.GLOBAL_TEMPLATES_DIR, 'templates', 'compiler').mkdir(parents=True, exist_ok=True)


def _seed_defaults() -> None:
    """Create default template files in the global store if they do not exist."""
    root = Path(settings.GLOBAL_TEMPLATES_DIR)
    _ensure_dirs()

    # Project README template
    readme_path = root / 'project' / 'README.md'
    if not readme_path.exists():
        readme_path.write_text(
            """# {{ PROJECT_NAME }}

Welcome to your Verbweaver project.

## Getting Started

Project description: {{ PROJECT_DESCRIPTION }}

Verbweaver organizes ideas and tasks as Markdown files under the `nodes/` folder. Each node can be a task; task fields live in YAML frontmatter.

### Project Structure

- `nodes/` — content and task nodes (Markdown)
- `uploads/` — files you attach to nodes
- `templates/` — templates for new nodes and compiler exports
- `.verbweaver/` — project settings and internal data

### Views

- Graph, Tasks (Board/Calendar/To‑Do), Editor, Version Control, Compiler

""",
            encoding='utf-8'
        )

    # Node template: copy from repository assets
    empty_nodes_dir = root / 'templates' / 'nodes'
    empty_nodes_dir.mkdir(parents=True, exist_ok=True)
    empty_nodes_path = empty_nodes_dir / 'Empty.md'
    empty_flat_dir = root / 'templates'
    empty_flat_dir.mkdir(parents=True, exist_ok=True)
    empty_flat_path = empty_flat_dir / 'Empty.md'
    try:
        # Repo assets path: <repo_root>/assets/templates/nodes
        assets_base = Path(__file__).resolve().parents[5] / 'assets' / 'templates' / 'nodes'
        src_empty = assets_base / 'Empty.md'
        if src_empty.exists():
            if not empty_nodes_path.exists():
                empty_nodes_path.write_text(src_empty.read_text(encoding='utf-8'), encoding='utf-8')
            if not empty_flat_path.exists():
                empty_flat_path.write_text(src_empty.read_text(encoding='utf-8'), encoding='utf-8')
    except Exception:
        pass

    # Compiler templates: copy from repository assets (Markdown for all formats)
    try:
        # Repo assets path: <repo_root>/assets/templates/compiler
        assets_compiler = Path(__file__).resolve().parents[5] / 'assets' / 'templates' / 'compiler'
        for fmt in ['markdown', 'html', 'pdf', 'docx', 'epub', 'odt']:
            fmt_dir = root / 'templates' / 'compiler' / fmt
            fmt_dir.mkdir(parents=True, exist_ok=True)
            src_fmt = assets_compiler / fmt
            if src_fmt.exists() and src_fmt.is_dir():
                for src_file in src_fmt.glob('*.md'):
                    dst_file = fmt_dir / src_file.name
                    if not dst_file.exists():
                        dst_file.write_text(src_file.read_text(encoding='utf-8'), encoding='utf-8')
    except Exception:
        pass


def _require_admin(user: User):
    # Minimal check; adapt to your User model/roles
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin access required')


@router.get("/global", response_model=Dict[str, Any])
async def list_global_templates(current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    _ensure_dirs()
    _seed_defaults()
    root = Path(settings.GLOBAL_TEMPLATES_DIR)
    def collect(dir_path: Path) -> List[Dict[str, str]]:
        items = []
        if dir_path.exists():
            for p in dir_path.rglob('*.md'):
                rel = p.relative_to(root).as_posix()
                items.append({ 'path': rel, 'name': p.name })
        return items
    return {
        'templates': collect(root)
    }


@router.get("/global/{rel_path:path}")
async def get_global_template(rel_path: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    _ensure_dirs()
    abs_path = Path(settings.GLOBAL_TEMPLATES_DIR) / rel_path
    if not abs_path.exists() or not abs_path.is_file():
        raise HTTPException(status_code=404, detail='Template not found')
    return {'path': rel_path, 'content': abs_path.read_text(encoding='utf-8')}


@router.put("/global/{rel_path:path}")
async def upsert_global_template(rel_path: str, payload: Dict[str, Any], current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    _ensure_dirs()
    content = payload.get('content', '')
    abs_path = Path(settings.GLOBAL_TEMPLATES_DIR) / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(content, encoding='utf-8')
    return {'message': 'Saved', 'path': rel_path}


@router.delete("/global/{rel_path:path}")
async def delete_global_template(rel_path: str, current_user: User = Depends(get_current_user)):
    _require_admin(current_user)
    abs_path = Path(settings.GLOBAL_TEMPLATES_DIR) / rel_path
    if abs_path.exists():
        abs_path.unlink()
        return {'message': 'Deleted'}
    raise HTTPException(status_code=404, detail='Template not found')

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