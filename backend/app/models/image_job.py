import enum

from sqlalchemy import JSON, Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class ImageJobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ImageJob(BaseModel):
    """One Content-Studio image request, run in the background so a slow
    generation (high quality + a logo-compositing edit pass) never sits on an
    HTTP request long enough to hit nginx / Cloudflare timeouts. The frontend
    creates a job and polls it, exactly like AI Video."""

    __tablename__ = "image_jobs"

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    mode = Column(String(10), nullable=False, default="generate")  # generate | chat
    prompt = Column(Text, nullable=False)          # the prompt, or the chat instruction
    params = Column(JSON, nullable=False, default=dict)  # size/quality/style/draft/brand_logo/...

    status = Column(Enum(ImageJobStatus), nullable=False, default=ImageJobStatus.QUEUED, index=True)
    result_url = Column(String(500), nullable=True)
    asset_id = Column(String(36), nullable=True)
    reply = Column(Text, nullable=True)            # chat mode: the assistant's line
    operation = Column(String(20), nullable=True)  # chat mode: generate | edit
    used_base = Column(String(20), nullable=True)  # chat mode: attachment | previous | none
    logo_applied = Column(String(160), nullable=True)
    logo_note = Column(Text, nullable=True)
    error = Column(Text, nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", foreign_keys=[owner_id])
