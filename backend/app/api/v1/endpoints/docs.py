"""
API Endpoints for serving documentation files.
"""
import os
import aiofiles # For async file operations
from fastapi import APIRouter, HTTPException, Security
from fastapi.responses import PlainTextResponse
from starlette.status import HTTP_404_NOT_FOUND
from typing import List
import logging

from app.core.config import settings
# Assuming a DocFile schema similar to what's needed by the frontend
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Define the path to the documentation directory
# This should be relative to the root of the backend application
# __file__ is backend/app/api/v1/endpoints/docs.py
# We want to go up to the project root (verbweaver/) and then into docs/
DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', '..', 'docs')
# This path calculation is a bit fragile. Consider using settings.DOCS_DIR if defined
# or a more robust way to get the project root.
# For now, assuming backend/app/api/v1/endpoints/docs.py -> backend/docs

class DocFileSchema(BaseModel):
    name: str
    path: str # filename
    type: str # 'file'

@router.get("", response_model=List[DocFileSchema])
async def list_documentation_files():
    """Lists all Markdown documentation files."""
    doc_files: List[DocFileSchema] = []
    try:
        if not os.path.exists(DOCS_DIR) or not os.path.isdir(DOCS_DIR):
            logger.error(f"Documentation directory not found or is not a directory: {DOCS_DIR}")
            raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Documentation directory not found.")

        for item in os.listdir(DOCS_DIR):
            if item.endswith('.md') and os.path.isfile(os.path.join(DOCS_DIR, item)):
                doc_files.append(DocFileSchema(
                    name=item.replace('.md', '').replace('-', ' ').replace('_', ' ').title(),
                    path=item, # Just the filename, e.g., "getting-started.md"
                    type='file'
                ))
        return doc_files
    except Exception as e:
        logger.error(f"Error listing documentation files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve documentation list.")

@router.get("/{filename}", response_class=PlainTextResponse)
async def get_documentation_file(filename: str):
    """Retrieves the content of a specific Markdown documentation file."""
    if '..' in filename or not filename.endswith('.md'):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = os.path.join(DOCS_DIR, filename)
    # Security check: Ensure the resolved path is still within DOCS_DIR
    if not os.path.abspath(file_path).startswith(os.path.abspath(DOCS_DIR)):
        raise HTTPException(status_code=403, detail="Access forbidden.")

    try:
        async with aiofiles.open(file_path, mode='r', encoding='utf-8') as f:
            content = await f.read()
        return content
    except FileNotFoundError:
        logger.warning(f"Documentation file not found: {filename} at {file_path}")
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail=f"Documentation file '{filename}' not found.")
    except Exception as e:
        logger.error(f"Error reading documentation file {filename}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve documentation file '{filename}'.") 