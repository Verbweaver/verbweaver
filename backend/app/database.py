"""
Database configuration - compatibility layer
"""

# Re-export from db.session for backward compatibility
from app.db.session import get_db, engine, AsyncSessionLocal

__all__ = ['get_db', 'engine', 'AsyncSessionLocal'] 