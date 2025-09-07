"""
Git operations endpoints (v1)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import os
import subprocess

from app.database import get_db
from app.models import Project, User
from app.core.security import get_current_user

router = APIRouter()


class RevertRequest(BaseModel):
    sha: str


@router.post("/projects/{project_id}/revert")
async def revert_commit(
    project_id: str,
    body: RevertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Revert a commit by SHA for a given project repository."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_path = (project.git_config or {}).get("path")
    if not project_path or not os.path.isdir(project_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project directory not found")

    try:
        subprocess.run(["git", "revert", "--no-edit", body.sha], cwd=project_path, check=True, capture_output=True)
        return {"message": f"Reverted {body.sha}"}
    except subprocess.CalledProcessError as e:
        err = (e.stderr or b"").decode(errors="ignore")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "git revert failed")


@router.post("/projects/{project_id}/reset/hard")
async def reset_hard(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Discard all uncommitted changes and delete untracked files for the project repo."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_path = (project.git_config or {}).get("path")
    if not project_path or not os.path.isdir(project_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project directory not found")

    try:
        subprocess.run(["git", "reset", "--hard"], cwd=project_path, check=True, capture_output=True)
        subprocess.run(["git", "clean", "-fd"], cwd=project_path, check=True, capture_output=True)
        return {"message": "Working tree reset and cleaned"}
    except subprocess.CalledProcessError as e:
        err = (e.stderr or b"").decode(errors="ignore")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "git reset failed")