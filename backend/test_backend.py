"""Test backend startup"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    print("Testing imports...")
    from app.core.config import settings
    print(f"✓ Config loaded, DB URL: {settings.DATABASE_URL}")
    
    from app.db.base import Base, engine
    print("✓ Database base imported")
    
    from app.models import User, Project
    print("✓ Models imported")
    
    from app.api.v1.api import api_router
    print("✓ API router imported")
    
    from app.websocket import websocket_endpoint
    print("✓ WebSocket imported")
    
    from app.main import app
    print("✓ Main app imported successfully!")
    
    print("\nAll imports successful! The backend should work.")
    
except Exception as e:
    print(f"❌ Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc() 