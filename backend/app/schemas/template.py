from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class TemplateResponse(BaseModel):
    path: str
    name: str
    metadata: Dict[str, Any]
    content: str

class CreateTemplateData(BaseModel):
    source_node_id: str
    template_name: str

class CreateNodeFromTemplateData(BaseModel):
    template_name: str
    parent_id: Optional[str] = None
    node_name: str
    initial_metadata: Optional[Dict[str, Any]] = None 