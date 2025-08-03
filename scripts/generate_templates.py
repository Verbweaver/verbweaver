#!/usr/bin/env python3
"""
Script to generate default compiler templates for Verbweaver
"""

import os
import sys
from pathlib import Path

# Add the backend directory to the Python path
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.services.template_service import TemplateService

def generate_templates(project_path: str):
    """Generate default templates for a project"""
    print(f"Generating templates for project: {project_path}")
    
    template_service = TemplateService(project_path)
    template_service.create_default_templates()
    
    print("✅ Default templates created successfully!")
    print("\nCreated templates:")
    
    for format_type in template_service.supported_formats:
        format_dir = template_service.templates_dir / format_type
        if format_dir.exists():
            templates = list(format_dir.glob("*.md"))
            if templates:
                print(f"  {format_type}/:")
                for template in templates:
                    print(f"    - {template.stem}")

def main():
    if len(sys.argv) != 2:
        print("Usage: python generate_templates.py <project_path>")
        sys.exit(1)
    
    project_path = sys.argv[1]
    
    if not os.path.exists(project_path):
        print(f"Error: Project path does not exist: {project_path}")
        sys.exit(1)
    
    try:
        generate_templates(project_path)
    except Exception as e:
        print(f"Error generating templates: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 