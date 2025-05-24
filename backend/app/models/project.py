"""
Project model
"""

from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from app.db.base import Base


class Project(Base):
    """Project model"""
    
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    
    # Git configuration
    git_config = Column(JSON, nullable=False)
    # Example structure:
    # {
    #     "type": "local",  # or "remote"
    #     "path": "/path/to/repo",
    #     "url": "https://github.com/user/repo.git",
    #     "branch": "main",
    #     "credentials": {...},
    #     "autoPush": false
    # }
    
    settings = Column(JSON, default=dict)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", backref="projects") 