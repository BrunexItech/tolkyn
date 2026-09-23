from sqlalchemy import Column, String, UniqueConstraint

from app.db.base import BaseModel


class SmsOptOut(BaseModel):
    """A phone number that replied STOP (or similar) to an SMS. Checked by
    MessagingService.send() before every broadcast so a suppressed number
    never receives another message -- see inbound_sms.py for how these
    rows get created.

    workspace_id is nullable: most workspaces send through the platform's
    one shared MobileSasa sender, so a STOP reply to it can't be
    attributed to a single tenant -- NULL means "opted out of the shared
    sender, applies platform-wide". A real workspace_id means the reply
    came in on THAT workspace's own dedicated sender ID (a paid override,
    see User.sms_sender_id), so it only suppresses sends from that one
    workspace.
    """

    __tablename__ = "sms_optouts"

    workspace_id = Column(String(36), nullable=True, index=True)
    phone = Column(String(20), nullable=False, index=True)  # E.164
    keyword = Column(String(20), nullable=True)  # the actual word that triggered it
    # created_at (inherited from BaseModel) is when they opted out

    __table_args__ = (
        UniqueConstraint("workspace_id", "phone", name="uq_sms_optout_workspace_phone"),
    )
