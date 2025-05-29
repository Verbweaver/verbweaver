from fastapi import APIRouter
from app.api.endpoints import auth, projects, graph, editor, tasks, git, compiler, templates

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(graph.router, tags=["graph"])
api_router.include_router(editor.router, tags=["editor"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(git.router, tags=["git"])
api_router.include_router(compiler.router, tags=["compiler"])
api_router.include_router(templates.router, tags=["templates"]) 