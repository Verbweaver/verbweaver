"""
Authentication schemas
"""

from pydantic import BaseModel, EmailStr, validator, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.core.config import settings


class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    name: Optional[str] = None


class UserCreate(UserBase):
    """Schema for user registration."""
    password: str
    
    @validator('password')
    def password_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Password cannot be empty')
        return v


class UserUpdate(BaseModel):
    """Schema for user profile update."""
    name: Optional[str] = None
    avatar: Optional[str] = None


class UserInDBBase(UserBase):
    id: str # UUID as string
    is_active: bool
    is_superuser: bool
    is_verified: bool
    # preferences: Optional[Dict[str, Any]] = {}
    hashed_password: Optional[str] = None # Made optional as per user model
    provider: Optional[str] = "email"
    avatar: Optional[str] = None
    # password_changed_at: Optional[datetime] = None # Already in UserResponse
    # last_login: Optional[datetime] = None # Already in UserResponse

    class Config:
        from_attributes = True # Changed from orm_mode for Pydantic v2


class UserResponse(UserInDBBase): # For returning user data, excluding sensitive fields
    # Inherits fields from UserInDBBase
    # Add fields specific to response that are not sensitive
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    password_changed_at: Optional[datetime] = None
    preferences: Optional[Dict[str, Any]] = {}


class Token(BaseModel):
    """Token response schema."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Optional[UserResponse] = None # Optionally include user details in token response


class TokenData(BaseModel):
    """Token data schema."""
    sub: Optional[str] = None
    type: Optional[str] = None


class PasswordChange(BaseModel):
    """Schema for password change."""
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    """Schema for password reset request."""
    email: EmailStr


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str = Field(..., min_length=settings.PASSWORD_MIN_LENGTH if hasattr(settings, 'PASSWORD_MIN_LENGTH') else 8)


class VerificationTokenPayload(BaseModel):
    user_id: str


class EmailVerification(BaseModel):
    """Schema for email verification."""
    token: str 