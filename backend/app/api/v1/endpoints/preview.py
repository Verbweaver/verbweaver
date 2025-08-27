from fastapi import APIRouter, Depends, HTTPException, status, Body, Response
from typing import Dict, Any, Optional, List
from app.services.template_service import TemplateService
from pydantic import BaseModel
import yaml

router = APIRouter()

import subprocess, tempfile, os

class PreviewRequest(BaseModel):
    markdown_text: str
    project_path: Optional[str] = None
    file_path: Optional[str] = None  # project-relative path of the Markdown file (for resolving relative assets)

@router.post("/preview", response_class=Response)
async def preview_markdown(request: PreviewRequest):
    """Convert Pandoc-flavoured Markdown to standalone HTML for live preview."""
    try:
        # Build pandoc command
        cmd = [
            "pandoc",
            "-f", "markdown",
            "-t", "html",
            "--standalone",
            "--self-contained",  # inline images so preview can render without extra network fetches
        ]
        # Configure resource-path for resolving images
        resource_paths: List[str] = []
        if request.project_path and os.path.exists(request.project_path):
            resource_paths.append(request.project_path)
            if request.file_path:
                # Use the markdown file's directory, if known
                base_dir = os.path.normpath(os.path.join(request.project_path, os.path.dirname(request.file_path)))
                if os.path.isdir(base_dir):
                    resource_paths.append(base_dir)
        if resource_paths:
            cmd.extend(["--resource-path", os.pathsep.join(resource_paths)])
        
        # Normalize image paths in markdown to be POSIX-style and project-relative
        import re as _re
        def _rewrite_img_paths(md: str) -> str:
            # Replace backslashes with slashes and strip a single leading slash for project-relative roots
            def repl(m: Any) -> str:
                prefix, path, suffix = m.group(1), m.group(2), m.group(3)
                p = path
                low = p.lower()
                if low.startswith('http://') or low.startswith('https://') or low.startswith('mailto:') or low.startswith('#'):
                    return m.group(0)
                p = p.replace('\\', '/')
                if p.startswith('/'):
                    p = p[1:]
                return f"{prefix}{p}{suffix}"
            return _re.sub(r'(!\[[^\]]*\]\()([^)]*)(\))', repl, md)

        normalized_markdown = _rewrite_img_paths(request.markdown_text)

        # Simple variable preprocessing so $title$ (and friends) work in Preview
        # Extract frontmatter from the provided markdown_text itself
        def _extract_frontmatter(md: str) -> Dict[str, Any]:
            try:
                m = _re.match(r'^---\s*\n(.*?)\n---\s*\n', md, _re.DOTALL)
                if not m:
                    return {}
                data = yaml.safe_load(m.group(1)) or {}
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}

        fm = _extract_frontmatter(request.markdown_text)
        vars_map: Dict[str, Any] = {}
        for k in ('title', 'author', 'date'):
            v = fm.get(k)
            if isinstance(v, (str, int, float, bool)):
                vars_map[k] = v

        # Replace $var$ when standalone (avoid nodes-scoped syntax)
        if vars_map:
            for key, value in vars_map.items():
                try:
                    pat = _re.compile(rf"(?<![A-Za-z0-9_\.])\${_re.escape(str(key))}\$")
                    normalized_markdown = pat.sub(str(value), normalized_markdown)
                except Exception:
                    normalized_markdown = normalized_markdown.replace(f'${key}$', str(value))

            # Minimal support for $if(var)$...$endif$ used by templates
            def _truthy(x: Any) -> bool:
                return bool(x)
            try:
                if_pat = _re.compile(r"\$if\(([^)]+)\)\$(.*?)\$endif\$", _re.DOTALL)
                def _if_repl(m):
                    expr = (m.group(1) or '').strip()
                    if expr.startswith('nodes.'):
                        return m.group(0)
                    val = vars_map.get(expr)
                    return m.group(2) if _truthy(val) else ''
                normalized_markdown = if_pat.sub(_if_repl, normalized_markdown)
            except Exception:
                pass

        # Create temporary markdown file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', 
                                       delete=False, encoding='utf-8') as temp_file:
            temp_file.write(normalized_markdown)
            temp_file_path = temp_file.name
        
        try:
            # Run pandoc with working directory if project path is provided
            if request.project_path and os.path.exists(request.project_path):
                result = subprocess.run(
                    cmd + [temp_file_path],
                    text=True,
                    capture_output=True,
                    cwd=request.project_path
                )
            else:
                # Fallback to stdin method if no project path
                result = subprocess.run(
                    cmd,
                    input=request.markdown_text,
                    text=True,
                    capture_output=True
                )
            
            if result.returncode != 0:
                raise RuntimeError(result.stderr.strip() or "Pandoc conversion failed")
            
            # Get the output
            output = result.stdout
            
        finally:
            # Clean up temporary file
            if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
        
        # Extract just the body content, removing Pandoc's CSS
        import re
        body_match = re.search(r'<body[^>]*>(.*?)</body>', output, re.DOTALL | re.IGNORECASE)
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
        .markdown-preview img {{
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0.5rem 0;
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
            return Response(content=output, media_type="text/html")
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Pandoc not installed on server")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))