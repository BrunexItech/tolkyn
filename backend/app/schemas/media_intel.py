from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WatchKind(str, Enum):
    PULSE = "pulse"
    COMPETITOR = "competitor"
    TREND = "trend"
    BRAND = "brand"


class BriefRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200)
    kind: WatchKind = WatchKind.PULSE


class WatchResponse(BaseModel):
    id: str
    topic: str
    kind: WatchKind
    last_brief: Optional[Dict[str, Any]] = None
    last_run_at: Optional[datetime] = None
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WatchList(BaseModel):
    items: List[WatchResponse]


class BriefResponse(BaseModel):
    brief: Dict[str, Any]
