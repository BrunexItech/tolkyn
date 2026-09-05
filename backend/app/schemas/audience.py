from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Contact(BaseModel):
    id: str
    kind: str
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    tags: List[str] = []
    meta: str
    source: str
    created_at: Optional[str] = None


class ContactPage(BaseModel):
    items: List[Contact]
    total: int


class AudienceOverview(BaseModel):
    contacts: int
    leads: int
    customers: int
    followers_total: int
    by_platform: List[Dict[str, Any]]
    by_country: List[Any]
    by_source: Dict[str, int]


class SegmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = None
    source: str = "all"
    filters: Dict[str, Any] = {}
    color: Optional[str] = None


class SegmentResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    source: str
    filters: Dict[str, Any]
    color: Optional[str] = None
    count: int = 0
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SegmentList(BaseModel):
    items: List[SegmentResponse]
