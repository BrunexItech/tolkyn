from sqlalchemy import Column, Integer, String, Text

from app.db.base import BaseModel


class EmailCampaign(BaseModel):
    """One tenant bulk-email send — subject/body + aggregate delivery counts.
    Per-recipient rows live in `email_sends` (email_campaign_id)."""

    __tablename__ = "email_campaigns"

    workspace_id = Column(String(36), nullable=False, index=True)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    email_account_id = Column(String(36), nullable=True)
    source = Column(String(20), nullable=False, default="manual")  # manual | leads | customers

    total = Column(Integer, nullable=False, default=0)
    sent = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    skipped = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="completed")  # sending | completed | failed

    created_by = Column(String(36), nullable=True)


class PlatformAnnouncement(BaseModel):
    """A super-admin email blast to registered Tolkyn users."""

    __tablename__ = "platform_announcements"

    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    audience = Column(String(400), nullable=True)  # human-readable summary of the filter
    total = Column(Integer, nullable=False, default=0)
    sent = Column(Integer, nullable=False, default=0)
    failed = Column(Integer, nullable=False, default=0)
    sent_by = Column(String(36), nullable=True)
