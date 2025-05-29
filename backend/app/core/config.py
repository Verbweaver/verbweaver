"""
Configuration settings for Verbweaver backend
"""

from typing import Optional, List, Any, Dict, Union
from pydantic_settings import BaseSettings
from pydantic import Field, validator
import secrets
import json
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    PROJECT_NAME: str = "Verbweaver"
    VERSION: str = "0.1.0"
    APP_NAME: str = "Verbweaver API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    
    # API
    API_V1_STR: str = "/api/v1"
    FRONTEND_URL: str = Field(default="http://localhost:3000", env="FRONTEND_URL")
    
    # Server
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8000, env="PORT")
    
    # Database
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./verbweaver.db",
        env="DATABASE_URL"
    )
    
    # Security
    SECRET_KEY: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        env="SECRET_KEY"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESET_TOKEN_EXPIRE_MINUTES: int = Field(default=30, env="RESET_TOKEN_EXPIRE_MINUTES")
    
    # Account Lockout settings
    MAX_LOGIN_ATTEMPTS: int = Field(default=5, env="MAX_LOGIN_ATTEMPTS")
    LOCKOUT_DURATION_MINUTES: int = Field(default=30, env="LOCKOUT_DURATION_MINUTES")
    
    # Password Policy
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_LOWERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = True
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
        env="BACKEND_CORS_ORIGINS"
    )
    
    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str):
            # Handle empty string
            if not v:
                return []
            # Handle comma-separated values
            if not v.startswith("["):
                return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Git
    GIT_PROJECTS_ROOT: str = Field(
        default="./git-repos",
        env="GIT_PROJECTS_ROOT"
    )
    
    # File storage
    UPLOAD_MAX_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_UPLOAD_EXTENSIONS: List[str] = [
        ".md", ".txt", ".json", ".yaml", ".yml",
        ".png", ".jpg", ".jpeg", ".gif", ".svg",
        ".pdf", ".docx", ".odt"
    ]
    
    # Redis (optional, for caching and real-time features)
    REDIS_URL: Optional[str] = Field(default=None, env="REDIS_URL")
    
    # Email (optional, for notifications)
    SMTP_HOST: Optional[str] = Field(default=None, env="SMTP_HOST")
    SMTP_PORT: Optional[int] = Field(default=None, env="SMTP_PORT")
    SMTP_USER: Optional[str] = Field(default=None, env="SMTP_USER")
    SMTP_PASSWORD: Optional[str] = Field(default=None, env="SMTP_PASSWORD")
    
    # OAuth providers
    GOOGLE_CLIENT_ID: Optional[str] = Field(default=None, env="GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: Optional[str] = Field(default=None, env="GOOGLE_CLIENT_SECRET")
    
    GITHUB_CLIENT_ID: Optional[str] = Field(default=None, env="GITHUB_CLIENT_ID")
    GITHUB_CLIENT_SECRET: Optional[str] = Field(default=None, env="GITHUB_CLIENT_SECRET")
    
    # Passkey (WebAuthn) settings
    WEBAUTHN_RP_ID: str = Field(default="localhost", env="WEBAUTHN_RP_ID") # Relying Party ID (your domain)
    WEBAUTHN_RP_NAME: str = Field(default="Verbweaver", env="WEBAUTHN_RP_NAME") # Relying Party Name
    # WEBAUTHN_RP_ORIGIN is derived from FRONTEND_URL for consistency during requests if needed,
    # but rp_id is the primary one for WebAuthn library configuration usually.
    # The WebAuthn library will often expect an explicit origin for challenges.
    # It's often set to be the same as FRONTEND_URL.
    WEBAUTHN_EXPECTED_ORIGIN: Optional[str] = Field(default=None, env="WEBAUTHN_EXPECTED_ORIGIN") # e.g., http://localhost:3000
    WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS: int = Field(default=120, env="WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS")
    
    # Export settings
    PANDOC_PATH: Optional[str] = Field(default=None, env="PANDOC_PATH")
    
    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_PER_MINUTE: int = 60
    
    @validator("WEBAUTHN_EXPECTED_ORIGIN", pre=True, always=True)
    def default_webauthn_expected_origin(cls, v, values):
        if v is None:
            return values.get("FRONTEND_URL")
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings() 