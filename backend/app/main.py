"""
Main FastAPI application for Verbweaver
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.core.config import settings
from app.api.v1.api import api_router
from app.api.v1.endpoints import oauth as oauth_router
from app.api.v1.endpoints import passkey as passkey_router
from app.db.init_db import init_db
from app.database import engine
from app.db.base import Base
from app.websocket import websocket_endpoint
from app.db.redis_client import get_redis_client, close_redis_client


# Create database tables
# Note: With async SQLAlchemy, tables are created in init_db() during startup
# Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add SessionMiddleware for OAuth state management and other session needs
# Ensure a strong, random secret_key is used, ideally from environment variables
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET_KEY if hasattr(settings, 'SESSION_SECRET_KEY') and settings.SESSION_SECRET_KEY else "super-secret-key-CHANGE-ME",
    # SameSite="lax" by default, consider "strict" if applicable. HTTPS is recommended.
    # https_only=not settings.DEBUG, # Enforce HTTPS for session cookies in production
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(oauth_router.router, prefix=f"{settings.API_V1_STR}/auth", tags=["OAuth"])
app.include_router(passkey_router.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Passkey"])

# Add WebSocket endpoint
app.websocket("/ws/{project_id}")(websocket_endpoint)

# Mount static files (for uploads, etc.)
# app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup"""
    await init_db()
    if settings.REDIS_URL:
        try:
            get_redis_client()
            print("Successfully connected to Redis.")
        except ConnectionError as e:
            print(f"Failed to connect to Redis on startup: {e}")
    
    import os
    os.makedirs(settings.GIT_PROJECTS_ROOT, exist_ok=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up application resources on shutdown"""
    if settings.REDIS_URL:
        await close_redis_client()
        print("Redis client connection closed.")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Verbweaver API",
        "version": settings.APP_VERSION,
        "docs": f"{settings.API_V1_STR}/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    ) 