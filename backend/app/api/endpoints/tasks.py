from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from pydantic import BaseModel
from enum import Enum

router = APIRouter()


class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: Optional[datetime] = None
    assignee: Optional[str] = None
    tags: List[str] = []


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[datetime] = None
    assignee: Optional[str] = None
    tags: Optional[List[str]] = None


class TaskMove(BaseModel):
    status: TaskStatus


class TaskResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[datetime]
    assignee: Optional[str]
    tags: List[str]
    created_at: datetime
    updated_at: datetime


# In-memory storage for tasks (in production, use a database)
tasks_storage = {}


@router.get("/projects/{project_id}/tasks", response_model=List[TaskResponse])
async def get_tasks(
    project_id: int,
    status: Optional[TaskStatus] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all tasks for a project, optionally filtered by status."""
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
    
    project_tasks = tasks_storage.get(project_id, {})
    tasks = list(project_tasks.values())
    
    if status:
        tasks = [t for t in tasks if t["status"] == status]
    
    return tasks


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse)
async def create_task(
    project_id: int,
    task: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new task."""
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
    
    # Create task
    task_id = str(uuid4())
    now = datetime.utcnow()
    
    new_task = {
        "id": task_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "assignee": task.assignee,
        "tags": task.tags,
        "created_at": now,
        "updated_at": now
    }
    
    # Store task
    if project_id not in tasks_storage:
        tasks_storage[project_id] = {}
    tasks_storage[project_id][task_id] = new_task
    
    return TaskResponse(**new_task)


@router.put("/projects/{project_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: int,
    task_id: str,
    task_update: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a task."""
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
    
    # Get task
    if project_id not in tasks_storage or task_id not in tasks_storage[project_id]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    task = tasks_storage[project_id][task_id]
    
    # Update fields
    update_data = task_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        task[field] = value
    
    task["updated_at"] = datetime.utcnow()
    
    return TaskResponse(**task)


@router.patch("/projects/{project_id}/tasks/{task_id}/move", response_model=TaskResponse)
async def move_task(
    project_id: int,
    task_id: str,
    move_data: TaskMove,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Move a task to a different status column."""
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
    
    # Get task
    if project_id not in tasks_storage or task_id not in tasks_storage[project_id]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    task = tasks_storage[project_id][task_id]
    task["status"] = move_data.status
    task["updated_at"] = datetime.utcnow()
    
    return TaskResponse(**task)


@router.delete("/projects/{project_id}/tasks/{task_id}")
async def delete_task(
    project_id: int,
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a task."""
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
    
    # Delete task
    if project_id not in tasks_storage or task_id not in tasks_storage[project_id]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    del tasks_storage[project_id][task_id]
    
    return {"message": "Task deleted", "task_id": task_id} 