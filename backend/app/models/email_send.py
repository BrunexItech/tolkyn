from sqlalchemy import Column, DateTime, Enum, String, Text
import enum

from app.db.base import BaseModel


class EmailSendStatus(str, enum.Enum):
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class EmailSend(BaseModel):
    """One outbound email attempt (audit + per-lead 'emailed' state)."""

    __tablename__ = "email_sends"

    workspace_id = Column(String(36), nullable=False, index=True)
    email_account_id = Column(String(36), nullable=True, index=True)
    lead_id = Column(String(36), nullable=True, index=True)
    email_campaign_id = Column(String(36), nullable=True, index=True)

    to_email = Column(String(255), nullable=False)
    from_email = Column(String(255), nullable=False)
    subject = Column(String(500), nullable=True)
    body_preview = Column(String(500), nullable=True)

    status = Column(Enum(EmailSendStatus), nullable=False, default=EmailSendStatus.SENT)
    error = Column(Text, nullable=True)
    provider_message_id = Column(String(255), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
