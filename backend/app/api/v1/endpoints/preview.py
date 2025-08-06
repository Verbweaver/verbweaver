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
        
        # Extract just the body content, removing Pandoc's CSS
        import re
        body_match = re.search(r'<body[^>]*>(.*?)</body>', result.stdout, re.DOTALL | re.IGNORECASE)
        if body_match:
            body_content = body_match.group(1)
            # Create clean HTML with scoped styling
            clean_html = f"""<!DOCTYPE html>
<html>
<head>
    <style>
        .markdown-preview {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #e5e7eb;
            background: transparent;
            margin: 0;
            padding: 0;
            max-width: none;
            width: 100%;
        }}
        .markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4, .markdown-preview h5, .markdown-preview h6 {{
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            font-weight: 600;
            color: #f3f4f6;
        }}
        .markdown-preview h1 {{ font-size: 2em; }}
        .markdown-preview h2 {{ font-size: 1.5em; }}
        .markdown-preview h3 {{ font-size: 1.25em; }}
        .markdown-preview p {{ margin-bottom: 1em; color: #e5e7eb; }}
        .markdown-preview ul, .markdown-preview ol {{ margin-bottom: 1em; padding-left: 2em; color: #e5e7eb; }}
        .markdown-preview li {{ margin-bottom: 0.5em; color: #e5e7eb; }}
        .markdown-preview code {{
            background-color: transparent;
            color: #fbbf24;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }}
        .markdown-preview pre {{
            background-color: rgba(255, 255, 255, 0.05);
            color: #fbbf24;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
            margin: 1em 0;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }}
        .markdown-preview blockquote {{
            border-left: 4px solid rgba(255, 255, 255, 0.3);
            margin: 1em 0;
            padding-left: 1em;
            color: #d1d5db;
            opacity: 0.8;
        }}
        .markdown-preview table {{
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }}
        .markdown-preview th, .markdown-preview td {{
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 0.5em;
            text-align: left;
            color: #e5e7eb;
        }}
        .markdown-preview th {{
            background-color: rgba(255, 255, 255, 0.1);
        }}
        .markdown-preview a {{
            color: #60a5fa;
            text-decoration: underline;
        }}
        .markdown-preview a:hover {{
            color: #93c5fd;
        }}
        .markdown-preview strong {{
            color: #f3f4f6;
        }}
    </style>
</head>
<body>
<div class="markdown-preview">
{body_content}
</div>
</body>
</html>"""
            return Response(content=clean_html, media_type="text/html")
        else:
            # Fallback to original HTML if body extraction fails
            return Response(content=result.stdout, media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Pandoc not installed on server")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))