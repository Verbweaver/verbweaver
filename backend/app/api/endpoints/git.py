from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.services.git_service import GitService
from pydantic import BaseModel

router = APIRouter()


class CommitCreate(BaseModel):
    message: str
    files: List[str]


class BranchCreate(BaseModel):
    name: str
    from_branch: Optional[str] = "main"


class CommitResponse(BaseModel):
    sha: str
    message: str
    author: str
    date: str


class BranchResponse(BaseModel):
    name: str
    is_current: bool


class StatusResponse(BaseModel):
    branch: str
    changes: List[dict]
    ahead: int
    behind: int


@router.get("/projects/{project_id}/status", response_model=StatusResponse)
async def get_status(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get git status for a project."""
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
    
    git_service = GitService()
    status = git_service.get_status(project_id)
    
    return StatusResponse(
        branch=status.get("branch", "main"),
        changes=status.get("changes", []),
        ahead=status.get("ahead", 0),
        behind=status.get("behind", 0)
    )


@router.get("/projects/{project_id}/commits", response_model=List[CommitResponse])
async def get_commits(
    project_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get commit history for a project."""
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
    
    git_service = GitService()
    commits = git_service.get_commits(project_id, limit)
    
    return [
        CommitResponse(
            sha=commit["sha"],
            message=commit["message"],
            author=commit["author"],
            date=commit["date"]
        )
        for commit in commits
    ]


@router.get("/projects/{project_id}/branches", response_model=List[BranchResponse])
async def get_branches(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all branches for a project."""
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
    
    git_service = GitService()
    branches = git_service.get_branches(project_id)
    
    return [
        BranchResponse(
            name=branch["name"],
            is_current=branch["is_current"]
        )
        for branch in branches
    ]


@router.post("/projects/{project_id}/commit")
async def create_commit(
    project_id: int,
    commit_data: CommitCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new commit."""
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
    
    git_service = GitService()
    
    try:
        # Stage files
        for file_path in commit_data.files:
            git_service.stage_file(project_id, file_path)
        
        # Commit
        commit = git_service.commit(
            project_id, 
            commit_data.message,
            author_name=current_user.username,
            author_email=current_user.email
        )
        
        return {
            "sha": commit["sha"],
            "message": commit["message"],
            "author": commit["author"],
            "date": commit["date"]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/projects/{project_id}/branches")
async def create_branch(
    project_id: int,
    branch_data: BranchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new branch."""
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
    
    git_service = GitService()
    
    try:
        branch = git_service.create_branch(
            project_id,
            branch_data.name,
            branch_data.from_branch
        )
        
        return {
            "name": branch["name"],
            "created": True
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/projects/{project_id}/checkout")
async def checkout_branch(
    project_id: int,
    branch_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Checkout a branch."""
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
    
    git_service = GitService()
    
    try:
        git_service.checkout_branch(project_id, branch_name)
        return {"message": f"Checked out branch: {branch_name}"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/projects/{project_id}/push")
async def push_changes(
    project_id: int,
    remote: str = "origin",
    branch: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Push changes to remote repository."""
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
    
    git_service = GitService()
    
    try:
        result = git_service.push(project_id, remote, branch)
        return {"message": "Successfully pushed changes", "details": result}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/projects/{project_id}/pull")
async def pull_changes(
    project_id: int,
    remote: str = "origin",
    branch: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Pull changes from remote repository."""
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
    
    git_service = GitService()
    
    try:
        result = git_service.pull(project_id, remote, branch)
        return {"message": "Successfully pulled changes", "details": result}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) 