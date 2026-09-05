import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class CallDirection(str, enum.Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class CallState(str, enum.Enum):
    QUEUED = "queued"      # inbound, waiting to be answered
    ACTIVE = "active"      # connected / live
    ENDED = "ended"        # finished (see outcome)


class CallOutcome(str, enum.Enum):
    COMPLETED = "completed"
    MISSED = "missed"
    VOICEMAIL = "voicemail"
    TRANSFERRED = "transferred"


class AgentStatus(str, enum.Enum):
    AVAILABLE = "available"
    ON_CALL = "on-call"
    AWAY = "away"
    OFFLINE = "offline"


class Call(BaseModel):
    __tablename__ = "calls"

    direction = Column(Enum(CallDirection), nullable=False, default=CallDirection.INBOUND)
    state = Column(Enum(CallState), nullable=False, default=CallState.QUEUED, index=True)
    outcome = Column(Enum(CallOutcome), nullable=True)

    contact_name = Column(String(200), nullable=True)
    number = Column(String(40), nullable=False)
    reason = Column(String(200), nullable=True)

    muted = Column(Boolean, default=False, nullable=False)
    on_hold = Column(Boolean, default=False, nullable=False)
    recorded = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)

    queued_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)   # when it connected
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_sec = Column(Integer, default=0, nullable=False)

    # The PBX's own id for this call (Yeastar call_id / channel). Lets the
    # event webhook and hangup target the right leg. NULL for simulated calls.
    provider_channel_id = Column(String(128), nullable=True, index=True)

    # IVR / auto-attendant position while the caller is still in the menu.
    # {"menu": "main", "retries": 0, "path": ["main"]}. Cleared once the call
    # is routed to an agent / voicemail / hung up.
    ivr_state = Column(JSONB, nullable=True)

    agent_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    agent = relationship("User", foreign_keys=[agent_id])


class CallAgent(BaseModel):
    __tablename__ = "call_agents"

    name = Column(String(200), nullable=False)
    initials = Column(String(4), nullable=False)
    status = Column(Enum(AgentStatus), nullable=False, default=AgentStatus.OFFLINE)
    calls_today = Column(Integer, default=0, nullable=False)
    is_self = Column(Boolean, default=False, nullable=False)

    # PBX extension this agent's browser softphone registers as (SIP.js).
    # Set by the workspace owner in Call Center settings; blank = no live line.
    sip_extension = Column(String(32), nullable=True)
    sip_password_enc = Column(String(500), nullable=True)

    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)
