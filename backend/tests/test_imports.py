"""Test backend imports and basic functionality"""
import pytest
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_config_import():
    """Test that config can be imported and loaded"""
    from app.core.config import settings
    assert settings is not None
    assert hasattr(settings, 'DATABASE_URL')


def test_database_import():
    """Test that database components can be imported"""
    from app.db.base import Base, engine
    assert Base is not None
    assert engine is not None


def test_models_import():
    """Test that models can be imported"""
    from app.models import User, Project
    assert User is not None
    assert Project is not None


def test_api_import():
    """Test that API router can be imported"""
    from app.api.v1.api import api_router
    assert api_router is not None


def test_websocket_import():
    """Test that WebSocket can be imported"""
    from app.websocket import websocket_endpoint
    assert websocket_endpoint is not None


def test_main_app_import():
    """Test that main app can be imported"""
    from app.main import app
    assert app is not None


def test_backend_functionality():
    """Test basic backend functionality"""
    from app.core.config import settings
    from app.main import app
    
    # Test that the app has the expected structure
    assert hasattr(app, 'routes')
    assert hasattr(settings, 'APP_NAME')
    assert settings.APP_NAME == "Verbweaver API"
