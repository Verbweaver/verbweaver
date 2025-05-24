"""
Main API router
"""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, users, projects, git, editor, graph, tasks, compiler

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(git.router, prefix="/git", tags=["git"])
api_router.include_router(editor.router, prefix="/editor", tags=["editor"])
api_router.include_router(graph.router, prefix="/graph", tags=["graph"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(compiler.router, prefix="/compiler", tags=["compiler"]) 