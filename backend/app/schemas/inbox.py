from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ThreadKind(str, Enum):
    COMMENT = "comment"
    MENTION = "mention"
    DM = "dm"
    REVIEW = "review"


class ThreadStatus(str, Enum):
    OPEN = "open"
    SNOOZED = "snoozed"
    DONE = "done"


class MessageResponse(BaseModel):
    id: str
    direction: str
    author_name: str
    body: str
    via: Optional[str] = None
    at: Optional[datetime] = None
    like_count: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ThreadSummary(BaseModel):
    id: str
    platform: str
    kind: ThreadKind
    status: ThreadStatus
    author_name: str
    author_handle: Optional[str] = None
    author_avatar: Optional[str] = None
    context: Optional[str] = None
    permalink: Optional[str] = None
    sentiment: Optional[str] = None
    priority: int
    unread: int
    assignee: Optional[str] = None
    last_message_at: Optional[datetime] = None
    preview: str = ""
    like_count: Optional[int] = None

    model_config = {"from_attributes": True}


class ThreadDetail(ThreadSummary):
    messages: List[MessageResponse] = []


class ThreadList(BaseModel):
    items: List[ThreadSummary]


class ReplyRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    via: str = "manual"


class StatusRequest(BaseModel):
    status: ThreadStatus


class AssignRequest(BaseModel):
    assignee: Optional[str] = None


class SyncNote(BaseModel):
    platform: str
    message: str


class InboxSummary(BaseModel):
    total: int
    unread: int
    open: int
    done: int
    negative: int
    by_platform: Dict[str, int]
    by_kind: Dict[str, int]
    live: bool = False
    notes: List[SyncNote] = []
