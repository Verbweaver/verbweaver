from fastapi import WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, Set
import json
from datetime import datetime
import asyncio
import logging
from app.models import User, Project
from app.services.git_service import GitService
from app.services.node_service import NodeService
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent, FileDeletedEvent, FileMovedEvent
import threading

from app.core.security import decode_token
from app.database import get_db
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}  # project_id -> websockets
        self.project_watchers: Dict[int, Observer] = {}  # project_id -> file observer
        self.user_projects: Dict[WebSocket, int] = {}  # websocket -> project_id
        
    async def connect(self, websocket: WebSocket, project_id: int):
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = set()
        self.active_connections[project_id].add(websocket)
        self.user_projects[websocket] = project_id
        
        # Start file watching for this project if not already started
        if project_id not in self.project_watchers:
            self.start_file_watching(project_id)
    
    def disconnect(self, websocket: WebSocket):
        project_id = self.user_projects.get(websocket)
        if project_id and project_id in self.active_connections:
            self.active_connections[project_id].discard(websocket)
            # If no more connections for this project, stop watching
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]
                self.stop_file_watching(project_id)
        if websocket in self.user_projects:
            del self.user_projects[websocket]
    
    def start_file_watching(self, project_id: int):
        """Start watching the Git repository for changes."""
        from app.database import SessionLocal
        
        # Get project path
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                return
            
            git_service = GitService(project)
            repo_path = git_service.repo_path
            
            # Create file system event handler
            event_handler = GitFileEventHandler(self, project_id)
            observer = Observer()
            observer.schedule(event_handler, repo_path, recursive=True)
            observer.start()
            
            self.project_watchers[project_id] = observer
            logger.info(f"Started file watching for project {project_id} at {repo_path}")
        finally:
            db.close()
    
    def stop_file_watching(self, project_id: int):
        """Stop watching the Git repository."""
        if project_id in self.project_watchers:
            observer = self.project_watchers[project_id]
            observer.stop()
            observer.join()
            del self.project_watchers[project_id]
            logger.info(f"Stopped file watching for project {project_id}")
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast_to_project(self, project_id: int, message: dict):
        """Broadcast a message to all connections for a project."""
        if project_id in self.active_connections:
            message_str = json.dumps(message)
            # Use asyncio to handle the broadcast
            disconnected = []
            for connection in self.active_connections[project_id]:
                try:
                    await connection.send_text(message_str)
                except Exception:
                    disconnected.append(connection)
            
            # Clean up disconnected clients
            for conn in disconnected:
                self.disconnect(conn)
    
    def notify_file_change(self, project_id: int, event_type: str, path: str):
        """Notify clients about file changes (called from file watcher thread)."""
        message = {
            "type": "file_change",
            "event": event_type,
            "path": path,
            "timestamp": datetime.now().isoformat()
        }
        
        # Schedule the async broadcast in the main event loop
        asyncio.create_task(self.broadcast_to_project(project_id, message))


class GitFileEventHandler(FileSystemEventHandler):
    """Handle file system events in the Git repository."""
    
    def __init__(self, manager: ConnectionManager, project_id: int):
        self.manager = manager
        self.project_id = project_id
        self.ignore_patterns = ['.git', '__pycache__', '.pyc', '.swp', '.tmp']
    
    def should_ignore(self, path: str) -> bool:
        """Check if the path should be ignored."""
        for pattern in self.ignore_patterns:
            if pattern in path:
                return True
        return False
    
    def on_modified(self, event: FileModifiedEvent):
        if not event.is_directory and not self.should_ignore(event.src_path):
            logger.debug(f"File modified: {event.src_path}")
            self.manager.notify_file_change(self.project_id, "modified", event.src_path)
    
    def on_created(self, event: FileCreatedEvent):
        if not self.should_ignore(event.src_path):
            logger.debug(f"File created: {event.src_path}")
            self.manager.notify_file_change(self.project_id, "created", event.src_path)
    
    def on_deleted(self, event: FileDeletedEvent):
        if not self.should_ignore(event.src_path):
            logger.debug(f"File deleted: {event.src_path}")
            self.manager.notify_file_change(self.project_id, "deleted", event.src_path)
    
    def on_moved(self, event: FileMovedEvent):
        if not self.should_ignore(event.src_path) and not self.should_ignore(event.dest_path):
            logger.debug(f"File moved: {event.src_path} -> {event.dest_path}")
            self.manager.notify_file_change(self.project_id, "moved", f"{event.src_path}:{event.dest_path}")


manager = ConnectionManager()


async def get_current_user_from_token(token: str, db: Session) -> User:
    """Get user from WebSocket token."""
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        user = db.query(User).filter(User.id == int(user_id)).first()
        return user
    except:
        return None


async def websocket_endpoint(
    websocket: WebSocket,
    project_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    """WebSocket endpoint for real-time collaboration."""
    # Authenticate user
    user = await get_current_user_from_token(token, db)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    
    # Connect
    await manager.connect(websocket, project_id)
    
    try:
        # Send initial connection message
        await manager.send_personal_message(
            json.dumps({
                "type": "connection",
                "status": "connected",
                "project_id": project_id,
                "user_id": user.id
            }),
            websocket
        )
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Handle different message types
                if message.get("type") == "ping":
                    await manager.send_personal_message(
                        json.dumps({"type": "pong"}),
                        websocket
                    )
                elif message.get("type") == "refresh":
                    # Client requests a refresh
                    await manager.broadcast_to_project(
                        project_id,
                        {
                            "type": "refresh_required",
                            "timestamp": datetime.now().isoformat()
                        }
                    )
                    
            except json.JSONDecodeError:
                await manager.send_personal_message(
                    json.dumps({"type": "error", "message": "Invalid JSON"}),
                    websocket
                )
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                break
                
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
        await manager.send_personal_message(
            json.dumps({
                "type": "connection",
                "status": "disconnected"
            }),
            websocket
        ) 