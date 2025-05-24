"""
User model for authentication
"""

from sqlalchemy import Column, String, DateTime, Boolean, JSON
from sqlalchemy.sql import func
import uuid

from app.db.base import Base


class User(Base):
    """User model"""
    
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # Nullable for OAuth users
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    provider = Column(String, default="email")  # email, google, github
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    preferences = Column(JSON, default=dict)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True) 