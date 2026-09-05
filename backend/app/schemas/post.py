from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PostStatus(str, Enum):
    DRAFT = "draft"
    NEEDS_APPROVAL = "needs_approval"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    PARTIAL = "partial"
    FAILED = "failed"


class MediaItem(BaseModel):
    url: str
    alt: str = ""
    type: str = "image"  # image | video


class MusicTrack(BaseModel):
    url: str
    title: str = ""


class PostCreate(BaseModel):
    title: Optional[str] = None
    body: str = ""
    platforms: List[str] = []
    media: List[MediaItem] = []
    music: Optional[MusicTrack] = None
    link: Optional[str] = None
    hashtags: List[str] = []
    scheduled_at: Optional[datetime] = None
    campaign_id: Optional[str] = None
    source_asset_id: Optional[str] = None


class PostUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    platforms: Optional[List[str]] = None
    media: Optional[List[MediaItem]] = None
    music: Optional[MusicTrack] = None
    link: Optional[str] = None
    hashtags: Optional[List[str]] = None
    scheduled_at: Optional[datetime] = None
    campaign_id: Optional[str] = None


class Finding(BaseModel):
    platform: str
    level: str
    message: str


class ChecksResult(BaseModel):
    ok: bool
    errors: int
    warnings: int
    findings: List[Finding]
    char_count: int
    hashtag_count: int
    link_count: int
    has_media: bool


class PostResponse(BaseModel):
    id: str
    title: Optional[str] = None
    body: str
    platforms: List[str]
    media: List[MediaItem]
    music: Optional[MusicTrack] = None
    link: Optional[str] = None
    hashtags: List[str]
    status: PostStatus
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    per_platform: Dict[str, Any] = {}
    provider_jobs: Optional[Dict[str, Any]] = None
    checks: Optional[ChecksResult] = None
    campaign_id: Optional[str] = None
    owner_id: Optional[str] = None
    pending_scheduled_at: Optional[datetime] = None
    pending_timezone: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PostList(BaseModel):
    items: List[PostResponse]
    total: int


class ScheduleRequest(BaseModel):
    scheduled_at: datetime
    timezone: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=2000)
