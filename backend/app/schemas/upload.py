from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class UploadResponse(BaseModel):
    id: str
    kind: str
    url: str
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    workspace_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadList(BaseModel):
    items: List[UploadResponse]
