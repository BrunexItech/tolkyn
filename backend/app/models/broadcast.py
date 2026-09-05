import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class BroadcastChannel(str, enum.Enum):
    SMS = "sms"
    WHATSAPP = "whatsapp"


class BroadcastStatus(str, enum.Enum):
    DRAFT = "draft"
    SENDING = "sending"
    SENT = "sent"
    PARTIAL = "partial"
    FAILED = "failed"


class Broadcast(BaseModel):
    __tablename__ = "broadcasts"

    channel = Column(Enum(BroadcastChannel), nullable=False, default=BroadcastChannel.SMS)
    status = Column(Enum(BroadcastStatus), nullable=False, default=BroadcastStatus.DRAFT)

    name = Column(String(200), nullable=False)
    body = Column(Text, nullable=False, default="")
    # [{ "name": "...", "phone": "+2547...", "source": "manual|lead|customer" }]
    recipients = Column(JSON, default=list, nullable=False)

    total = Column(Integer, default=0, nullable=False)
    sent_count = Column(Integer, default=0, nullable=False)
    failed_count = Column(Integer, default=0, nullable=False)
    # [{ "phone": "...", "ok": true, "error": null, "id": "..." }]
    results = Column(JSON, default=list, nullable=False)

    provider = Column(String(40), nullable=True)   # twilio | whatsapp_cloud | simulated
    simulated = Column(Integer, default=1, nullable=False)

    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
