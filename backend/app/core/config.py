"""
Configuration settings for Verbweaver backend
"""

from typing import Optional, List
from pydantic_settings import BaseSettings
from pydantic import Field
import secrets


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "Verbweaver API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False, env="DEBUG")
    
    # API
    API_V1_STR: str = "/api/v1"
    
    # Server
    HOST: str = Field(default="0.0.0.0", env="HOST")
    PORT: int = Field(default=8000, env="PORT")
    
    # Database
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./verbweaver.db",
        env="DATABASE_URL"
    )
    
    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001"],
        env="BACKEND_CORS_ORIGINS"
    )
    
    # Git
    GIT_PROJECTS_ROOT: str = Field(
        default="./projects",
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
    
    # Export settings
    PANDOC_PATH: Optional[str] = Field(default=None, env="PANDOC_PATH")
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings() 