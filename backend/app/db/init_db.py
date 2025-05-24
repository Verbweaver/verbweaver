"""
Database initialization
"""

from app.db.base import Base, engine
from app.models import User, Project  # Import all models to register them


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all) 