#!/usr/bin/env python
"""
Development runner for Verbweaver backend
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    """Run the development server"""
    # Set environment variables for development
    os.environ["DEBUG"] = "True"
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./dev_verbweaver.db"
    
    # Ensure we're in the backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    # Run the FastAPI server with uvicorn
    cmd = [
        sys.executable, "-m", "uvicorn",
        "app.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000"
    ]
    
    print("Starting Verbweaver backend in development mode...")
    print(f"API will be available at http://localhost:8000")
    print(f"API docs will be available at http://localhost:8000/api/v1/docs")
    print("\nPress Ctrl+C to stop the server\n")
    
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\nShutting down...")

if __name__ == "__main__":
    main() 