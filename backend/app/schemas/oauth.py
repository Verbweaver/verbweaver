from pydantic import BaseModel, EmailStr
from typing import Optional

class OAuthCode(BaseModel):
    code: str
    state: Optional[str] = None # For CSRF protection

class OAuthProviderUser(BaseModel):
    provider: str # e.g., 'google', 'github'
    provider_user_id: str
    email: EmailStr
    name: Optional[str] = None
    avatar_url: Optional[str] = None

class OAuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None # Some providers might not issue a refresh token for OAuth flow
    token_type: str = "bearer"
    user: dict # We'll populate this similarly to our regular login 