"""
Token Pydantic Schemas
"""
from pydantic import BaseModel
from typing import Optional

# Forward import UserResponse if needed for Token schema, or keep it optional
# from .user import UserResponse # This would create a circular import if UserResponse also imports something from token. Best to keep Token simple.

class Token(BaseModel):
    """Standard token response schema, including access and refresh tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    # user: Optional[UserResponse] = None # Removed to avoid circular dependency if UserResponse needs token info
                                      # The API endpoint can construct this part of response dynamically.

class TokenPayload(BaseModel): # Renamed from TokenData for consistency with __init__.py
    """Schema for the data encoded within a JWT (e.g., subject, type)."""
    sub: Optional[str] = None # Subject (usually user ID)
    type: Optional[str] = None # e.g., "access" or "refresh"
    jti: Optional[str] = None # JWT ID
    # Add other claims as needed, like 'exp' for expiration, but Pydantic usually handles this implicitly if part of JWT model

# Specific schemas for AccessToken and RefreshToken if they have distinct structures beyond the standard Token model
# For now, __init__.py imports them, but they might not be strictly necessary if Token covers all uses.

class AccessToken(TokenPayload):
    """Schema representing the payload of an access token, if more specific fields are needed."""
    # Typically, access token payloads are validated for 'type': 'access' and 'sub'
    pass

class RefreshToken(TokenPayload):
    """Schema representing the payload of a refresh token, if more specific fields are needed."""
    # Typically, refresh token payloads are validated for 'type': 'refresh' and 'sub'
    pass 