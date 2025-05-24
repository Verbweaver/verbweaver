"""
Project schemas
"""

from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel


class GitConfigBase(BaseModel):
    """Git configuration base schema"""
    type: str = "local"  # local or remote
    path: Optional[str] = None
    url: Optional[str] = None
    branch: str = "main"
    credentials: Optional[Dict[str, str]] = None
    autoPush: bool = False


class ProjectBase(BaseModel):
    """Project base schema"""
    name: str
    description: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class ProjectCreate(ProjectBase):
    """Schema for creating a project"""
    git_config: GitConfigBase


class ProjectUpdate(BaseModel):
    """Schema for updating a project"""
    name: Optional[str] = None
    description: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    git_config: Optional[GitConfigBase] = None


class ProjectResponse(ProjectBase):
    """Schema for project response"""
    id: str
    user_id: str
    git_config: Dict[str, Any]
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True 