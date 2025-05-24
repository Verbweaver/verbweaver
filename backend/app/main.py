"""
Main FastAPI application for Verbweaver
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.core.config import settings
from app.api.v1.api import api_router
from app.db.init_db import init_db
from app.database import engine
from app.db.base import Base
from app.websocket import websocket_endpoint


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
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Add WebSocket endpoint
app.websocket("/ws/{project_id}")(websocket_endpoint)

# Mount static files (for uploads, etc.)
# app.mount("/static", StaticFiles(directory="static"), name="static")


@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup"""
    # Initialize database
    await init_db()
    
    # Create projects directory if it doesn't exist
    import os
    os.makedirs(settings.GIT_PROJECTS_ROOT, exist_ok=True)


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