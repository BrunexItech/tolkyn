"""A 'WhatsApp community' campaign — several real customers experience one
shared conversation, but never see each other's real name or number. There
is no native WhatsApp group involved: each participant has an ordinary,
private 1:1 chat with the business number (see whatsapp_web_service), and
when one of them replies, that reply is relayed out to everyone else's own
private chat under their pseudo-name. WhatsApp's own "hide my number in a
community" setting is opt-in per member and not something a business can
force on — this design guarantees the privacy property in our own code
instead of depending on that."""
from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class CampaignGroup(BaseModel):
    __tablename__ = "campaign_groups"

    name = Column(String(200), nullable=False)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    participants = relationship(
        "CampaignGroupParticipant", back_populates="group", cascade="all, delete-orphan"
    )
    messages = relationship(
        "CampaignGroupMessage", back_populates="group", cascade="all, delete-orphan",
        order_by="CampaignGroupMessage.created_at",
    )


class CampaignGroupParticipant(BaseModel):
    __tablename__ = "campaign_group_participants"

    group_id = Column(String(36), ForeignKey("campaign_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    phone = Column(String(32), nullable=False, index=True)  # E.164 — real identity, admin-only
    real_name = Column(String(160), nullable=True)
    pseudo_name = Column(String(40), nullable=False)  # "Participant 1" — the only identity other members ever see
    workspace_id = Column(String(36), nullable=False, index=True)

    group = relationship("CampaignGroup", back_populates="participants")


class CampaignGroupMessage(BaseModel):
    __tablename__ = "campaign_group_messages"

    group_id = Column(String(36), ForeignKey("campaign_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    participant_id = Column(
        String(36), ForeignKey("campaign_group_participants.id", ondelete="SET NULL"), nullable=True
    )
    # Null participant_id means the admin posted it (an announcement, not a reply).
    body = Column(Text, nullable=False)
    workspace_id = Column(String(36), nullable=False, index=True)

    group = relationship("CampaignGroup", back_populates="messages")
    participant = relationship("CampaignGroupParticipant")
