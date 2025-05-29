from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import User, Project
from app.core.security import get_current_user
from app.services.node_service import NodeService
from pydantic import BaseModel

router = APIRouter()


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: Optional[str] = "medium"
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    parent_path: str = "tasks"  # Default to tasks directory


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    completed_date: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    path: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assignee: Optional[str] = None
    due_date: Optional[str] = None
    created_date: str
    completed_date: Optional[str] = None
    node_metadata: dict


@router.get("/projects/{project_id}/tasks", response_model=List[TaskResponse])
async def get_tasks(
    project_id: int,
    status: Optional[str] = None,
    assignee: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all tasks for a project (nodes with task metadata)."""
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
    
    # Use NodeService to get nodes with tasks
    node_service = NodeService(project)
    all_nodes = await node_service.list_nodes()
    
    # Filter for nodes with task metadata
    tasks = []
    for node in all_nodes:
        if node["hasTask"]:
            task_data = node["metadata"].get("task", {})
            
            # Apply filters
            if status and task_data.get("status") != status:
                continue
            if assignee and task_data.get("assignee") != assignee:
                continue
            
            # Convert to TaskResponse
            tasks.append(TaskResponse(
                id=node["metadata"]["id"],
                path=node["path"],
                title=node["metadata"]["title"],
                description=task_data.get("description"),
                status=task_data.get("status", "todo"),
                priority=task_data.get("priority", "medium"),
                assignee=task_data.get("assignee"),
                due_date=task_data.get("dueDate"),
                created_date=node["metadata"].get("created", datetime.now().isoformat()),
                completed_date=task_data.get("completedDate"),
                node_metadata=node["metadata"]
            ))
    
    return tasks


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse)
async def create_task(
    project_id: int,
    task: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new task (a node with task metadata)."""
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
    
    # Create node with task metadata
    node_service = NodeService(project)
    
    # Ensure tasks directory exists
    try:
        tasks_dir = await node_service.read_node("tasks")
        if not tasks_dir:
            # Create tasks directory
            await node_service.create_node("", "tasks", "folder")
    except:
        # Create tasks directory
        try:
            await node_service.create_node("", "tasks", "folder")
        except:
            pass  # Directory might already exist
    
    # Prepare task metadata
    task_metadata = {
        "type": "task",
        "task": {
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "assignee": task.assignee,
            "dueDate": task.due_date,
            "createdDate": datetime.now().isoformat()
        }
    }
    
    # Create the task node
    try:
        created_node = await node_service.create_node(
            parent_path=task.parent_path,
            name=task.title,
            node_type="task",
            initial_metadata=task_metadata,
            initial_content=f"# {task.title}\n\n{task.description or ''}\n\n## Task Details\n\n- Status: {task.status}\n- Priority: {task.priority}\n- Assignee: {task.assignee or 'Unassigned'}\n- Due Date: {task.due_date or 'No due date'}\n"
        )
        
        task_data = created_node["metadata"].get("task", {})
        return TaskResponse(
            id=created_node["metadata"]["id"],
            path=created_node["path"],
            title=created_node["metadata"]["title"],
            description=task_data.get("description"),
            status=task_data.get("status", "todo"),
            priority=task_data.get("priority", "medium"),
            assignee=task_data.get("assignee"),
            due_date=task_data.get("dueDate"),
            created_date=created_node["metadata"].get("created", datetime.now().isoformat()),
            completed_date=task_data.get("completedDate"),
            node_metadata=created_node["metadata"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/projects/{project_id}/tasks/{task_path:path}", response_model=TaskResponse)
async def get_task(
    project_id: int,
    task_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific task by path."""
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
    
    # Get the node
    node_service = NodeService(project)
    node = await node_service.read_node(task_path)
    
    if not node or not node["hasTask"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    task_data = node["metadata"].get("task", {})
    return TaskResponse(
        id=node["metadata"]["id"],
        path=node["path"],
        title=node["metadata"]["title"],
        description=task_data.get("description"),
        status=task_data.get("status", "todo"),
        priority=task_data.get("priority", "medium"),
        assignee=task_data.get("assignee"),
        due_date=task_data.get("dueDate"),
        created_date=node["metadata"].get("created", datetime.now().isoformat()),
        completed_date=task_data.get("completedDate"),
        node_metadata=node["metadata"]
    )


@router.put("/projects/{project_id}/tasks/{task_path:path}", response_model=TaskResponse)
async def update_task(
    project_id: int,
    task_path: str,
    task_update: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a task."""
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
    
    # Get current node
    node_service = NodeService(project)
    node = await node_service.read_node(task_path)
    
    if not node or not node["hasTask"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Update task metadata
    current_task = node["metadata"].get("task", {})
    
    # Update only provided fields
    if task_update.title is not None:
        node["metadata"]["title"] = task_update.title
    if task_update.description is not None:
        current_task["description"] = task_update.description
    if task_update.status is not None:
        current_task["status"] = task_update.status
        # Set completed date if status is done
        if task_update.status == "done" and not current_task.get("completedDate"):
            current_task["completedDate"] = datetime.now().isoformat()
    if task_update.priority is not None:
        current_task["priority"] = task_update.priority
    if task_update.assignee is not None:
        current_task["assignee"] = task_update.assignee
    if task_update.due_date is not None:
        current_task["dueDate"] = task_update.due_date
    if task_update.completed_date is not None:
        current_task["completedDate"] = task_update.completed_date
    
    # Update the node
    try:
        updated_node = await node_service.update_node(
            path=task_path,
            metadata_updates={
                "title": node["metadata"]["title"],
                "task": current_task
            }
        )
        
        task_data = updated_node["metadata"].get("task", {})
        return TaskResponse(
            id=updated_node["metadata"]["id"],
            path=updated_node["path"],
            title=updated_node["metadata"]["title"],
            description=task_data.get("description"),
            status=task_data.get("status", "todo"),
            priority=task_data.get("priority", "medium"),
            assignee=task_data.get("assignee"),
            due_date=task_data.get("dueDate"),
            created_date=updated_node["metadata"].get("created", datetime.now().isoformat()),
            completed_date=task_data.get("completedDate"),
            node_metadata=updated_node["metadata"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/projects/{project_id}/tasks/{task_path:path}")
async def delete_task(
    project_id: int,
    task_path: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a task."""
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
    
    # Check if it's a task
    node_service = NodeService(project)
    node = await node_service.read_node(task_path)
    
    if not node or not node["hasTask"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Delete the node
    try:
        await node_service.delete_node(task_path)
        return {"message": "Task deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) 