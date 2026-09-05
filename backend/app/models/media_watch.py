from sqlalchemy import Column, DateTime, Enum, ForeignKey, JSON, String
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class WatchKind(str, enum.Enum):
    PULSE = "pulse"          # what's happening in <topic> right now
    COMPETITOR = "competitor"  # news about <company>
    TREND = "trend"          # emerging trends in <industry>
    BRAND = "brand"          # mentions of <your brand>


class MediaWatch(BaseModel):
    """A topic the workspace tracks for live intelligence briefings."""

    __tablename__ = "media_watches"

    topic = Column(String(200), nullable=False)
    kind = Column(Enum(WatchKind), nullable=False, default=WatchKind.PULSE)

    last_brief = Column(JSON, nullable=True)         # cached brief payload
    last_run_at = Column(DateTime(timezone=True), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
