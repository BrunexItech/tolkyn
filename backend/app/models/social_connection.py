from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class ConnectionStatus(str, enum.Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class SocialConnection(BaseModel):
    """A connected social account for a workspace."""

    __tablename__ = "social_connections"

    platform = Column(String(30), nullable=False)  # facebook / instagram / x / tiktok / linkedin / youtube / whatsapp
    status = Column(Enum(ConnectionStatus), nullable=False, default=ConnectionStatus.DISCONNECTED)

    handle = Column(String(160), nullable=True)
    display_name = Column(String(160), nullable=True)
    account_ref = Column(String(200), nullable=True)  # page id / channel id / user id
    avatar_url = Column(String(600), nullable=True)

    access_token_enc = Column(Text, nullable=True)    # optional real token (Fernet)
    scopes = Column(JSON, default=list, nullable=False)
    followers = Column(Integer, nullable=True)

    connected_at = Column(DateTime(timezone=True), nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (UniqueConstraint("workspace_id", "platform", name="uq_social_ws_platform"),)
