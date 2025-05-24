from fastapi import WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, Set
import json
from datetime import datetime

from app.core.security import decode_token
from app.database import get_db
from app.models import User
from sqlalchemy.orm import Session


class ConnectionManager:
    def __init__(self):
        # Store active connections by project_id
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        # Store user info for each connection
        self.connection_users: Dict[WebSocket, dict] = {}
    
    async def connect(self, websocket: WebSocket, project_id: int, user_info: dict):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        
        # Add to project connections
        if project_id not in self.active_connections:
            self.active_connections[project_id] = set()
        self.active_connections[project_id].add(websocket)
        
        # Store user info
        self.connection_users[websocket] = user_info
        
        # Notify others in the project
        await self.broadcast(project_id, {
            "type": "USER_JOIN",
            "data": {
                "user": user_info,
                "timestamp": datetime.utcnow().isoformat()
            }
        }, exclude=websocket)
    
    def disconnect(self, websocket: WebSocket, project_id: int):
        """Remove a WebSocket connection."""
        if project_id in self.active_connections:
            self.active_connections[project_id].discard(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]
        
        # Get user info before removing
        user_info = self.connection_users.pop(websocket, None)
        
        # Notify others in the project
        if user_info:
            # This is async but called from sync context, so we'll skip the notification
            # In production, you'd want to handle this properly
            pass
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific WebSocket."""
        await websocket.send_text(message)
    
    async def broadcast(self, project_id: int, message: dict, exclude: WebSocket = None):
        """Broadcast a message to all connections in a project."""
        if project_id in self.active_connections:
            message_text = json.dumps(message)
            for connection in self.active_connections[project_id]:
                if connection != exclude:
                    try:
                        await connection.send_text(message_text)
                    except:
                        # Connection might be closed
                        pass


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
    
    # Create user info
    user_info = {
        "id": user.id,
        "username": user.username,
        "email": user.email
    }
    
    # Connect
    await manager.connect(websocket, project_id, user_info)
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Add user info to message
            message["user"] = user_info
            message["timestamp"] = datetime.utcnow().isoformat()
            
            # Broadcast to others in the project
            await manager.broadcast(project_id, message, exclude=websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)
        # Notify others
        await manager.broadcast(project_id, {
            "type": "USER_LEAVE",
            "data": {
                "user": user_info,
                "timestamp": datetime.utcnow().isoformat()
            }
        })
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, project_id) 