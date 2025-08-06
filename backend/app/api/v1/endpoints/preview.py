from fastapi import APIRouter, Depends, HTTPException, status, Body, Response
from typing import Dict, Any
from app.services.template_service import TemplateService

router = APIRouter()

import subprocess, tempfile

@router.post("/preview", response_class=Response)
async def preview_markdown(
    markdown_text: str = Body(..., media_type="text/markdown")
):
    """Convert Pandoc-flavoured Markdown to standalone HTML for live preview."""
    try:
        result = subprocess.run(
            [
                "pandoc",
                "-f", "markdown",
                "-t", "html",
                "--standalone",
                "--self-contained",
            ],
            input=markdown_text,
            text=True,
            capture_output=True
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Pandoc conversion failed")
        return Response(content=result.stdout, media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Pandoc not installed on server")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))