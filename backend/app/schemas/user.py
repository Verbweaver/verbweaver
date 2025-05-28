"""
User Pydantic Schemas
"""
from pydantic import BaseModel, EmailStr, validator, Field
from typing import Optional, Dict, Any
from datetime import datetime
from app.core.config import settings # For PASSWORD_MIN_LENGTH

class UserBase(BaseModel):
    """Base user schema, often used for creation without ID."""
    email: EmailStr
    name: Optional[str] = None

class UserCreate(UserBase):
    """Schema for user registration, includes password."""
    password: str
    
    @validator('password')
    def password_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('Password cannot be empty')
        # Further password strength validation could be added here or rely on global validation
        return v

class UserUpdate(BaseModel):
    """Schema for user profile update. All fields are optional."""
    name: Optional[str] = None
    avatar: Optional[str] = None
    # Add other updatable fields here, e.g., preferences if not a separate schema

class UserInDB(UserBase): # Renamed from UserInDBBase for consistency
    """Schema for user data as stored in the database, including ID and system fields."""
    id: str # UUID as string
    is_active: bool
    is_superuser: bool
    is_verified: bool
    hashed_password: Optional[str] = None
    provider: Optional[str] = "email"
    avatar: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = {} # Added as __init__.py imports UserWithPreferences
    
    class Config:
        from_attributes = True

class UserResponse(UserInDB): # Inherits from UserInDB which includes preferences
    """Schema for user data returned in API responses, excluding sensitive fields like hashed_password."""
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    password_changed_at: Optional[datetime] = None

    # Override hashed_password from UserInDB to exclude it from UserResponse model serialization
    hashed_password: Optional[str] = Field(default=None, exclude=True)
    
    # Pydantic V2 no longer uses model_config = {"fields": ...} for this.
    # exclude=True on the Field itself is the V2 way for default exclusion.


# User schema for __init__.py's "User" - typically a read/response model
User = UserResponse 

# UserWithPreferences can be an alias or a more specific type if needed.
# For now, UserResponse (via UserInDB) includes 'preferences'.
UserWithPreferences = UserResponse 


class PasswordChange(BaseModel):
    """Schema for password change by an authenticated user."""
    current_password: str
    new_password: str

class PasswordResetRequest(BaseModel): # As expected by __init__.py
    """Schema for initiating a password reset request."""
    email: EmailStr

class PasswordReset(BaseModel): # Renamed from ResetPasswordPayload
    """Schema for completing a password reset with a token."""
    token: str
    new_password: str = Field(..., min_length=settings.PASSWORD_MIN_LENGTH if hasattr(settings, 'PASSWORD_MIN_LENGTH') else 8)


class VerificationTokenPayload(BaseModel): # Used for email verification token content
    user_id: str

class EmailVerification(BaseModel):
    """Schema for submitting an email verification token."""
    token: str 