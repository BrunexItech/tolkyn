from sqlalchemy import Column, DateTime, Enum, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class PostStatus(str, enum.Enum):
    DRAFT = "draft"
    NEEDS_APPROVAL = "needs_approval"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    PARTIAL = "partial"      # some platforms ok, some failed
    FAILED = "failed"


class Post(BaseModel):
    """A piece of content targeted at one or more connected platforms."""

    __tablename__ = "posts"

    title = Column(String(200), nullable=True)
    body = Column(Text, nullable=False, default="")
    platforms = Column(JSON, default=list, nullable=False)     # ["instagram", "x"]
    media = Column(JSON, default=list, nullable=False)         # [{"url","alt","type"}]
    link = Column(String(600), nullable=True)
    hashtags = Column(JSON, default=list, nullable=False)
    music = Column(JSON, nullable=True)  # {"url","title"}

    status = Column(Enum(PostStatus), nullable=False, default=PostStatus.DRAFT)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)

    per_platform = Column(JSON, default=dict, nullable=False)  # {"instagram": {"status","url","error"}}
    checks = Column(JSON, nullable=True)                       # last preflight result
    provider_jobs = Column(JSON, nullable=True)                # {"request_id": "...", "job_id": "...", "mode": "..."}

    campaign_id = Column(String(36), nullable=True, index=True)
    source_asset_id = Column(String(36), nullable=True)

    # Approval workflow: a non-owner/admin author's schedule()/publish() call
    # lands here instead of taking effect immediately (see PostService).
    # pending_* remembers what was actually requested so approve() can honor
    # it; rejection_reason is shown back to the author when a reviewer sends
    # it back to draft.
    pending_scheduled_at = Column(DateTime(timezone=True), nullable=True)
    pending_timezone = Column(String(64), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
