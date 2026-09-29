from sqlalchemy import Column, String, UniqueConstraint

from app.db.base import BaseModel


class EmailBounce(BaseModel):
    """An address a mailbox provider has told us doesn't exist / can't
    receive mail (a hard bounce, detected from an inbound "Mail Delivery
    Subsystem" reply -- see email_bounce_service.py). Checked before every
    future campaign/outreach send so the same known-dead address doesn't
    keep getting sent to and bouncing again -- the email equivalent of
    SmsOptOut, same reasoning, same shape.
    """

    __tablename__ = "email_bounces"

    workspace_id = Column(String(36), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("workspace_id", "email", name="uq_email_bounce_workspace_email"),
    )
