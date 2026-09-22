from sqlalchemy import Boolean, Column, DateTime, String, Text

from app.db.base import BaseModel


class EmailReply(BaseModel):
    """An incoming message found in a sending account's own mailbox via
    IMAP -- see services/email_reply_service.py. Not matched to a specific
    campaign (a reply's Subject/threading is unreliable across providers);
    this is simply "what's arrived in this inbox since we last checked",
    the same scope the user actually asked for."""

    __tablename__ = "email_replies"

    workspace_id = Column(String(36), nullable=False, index=True)
    email_account_id = Column(String(36), nullable=False, index=True)
    message_id = Column(String(255), nullable=True, index=True)  # de-dup key

    from_email = Column(String(255), nullable=False)
    from_name = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=True)
    body_preview = Column(Text, nullable=True)

    received_at = Column(DateTime(timezone=True), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
