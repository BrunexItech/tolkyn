import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, JSON, String
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class TeamRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    ANALYST = "analyst"
    VIEWER = "viewer"


class MemberStatus(str, enum.Enum):
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"


# Capability keys the UI shows per role. OWNER implicitly has everything.
# "approvals" governs who can approve/reject a teammate's post before it goes
# out — only owner (implicit "*") and admin get it; editor is the role whose
# publish/schedule calls actually get deferred for approval (see PostService).
ROLE_PERMISSIONS: dict[str, list[str]] = {
    "owner": ["*"],
    "admin": ["publish", "engage", "campaigns", "analytics", "leads", "crm",
              "automations", "messaging", "billing", "team", "connections", "approvals"],
    "editor": ["publish", "engage", "campaigns", "leads", "crm", "messaging", "connections"],
    "analyst": ["analytics", "campaigns", "leads"],
    "viewer": ["analytics"],
}


class TeamMember(BaseModel):
    __tablename__ = "team_members"

    email = Column(String(255), nullable=False, index=True)
    name = Column(String(200), nullable=True)
    title = Column(String(120), nullable=True)
    avatar_color = Column(String(16), nullable=True)

    role = Column(Enum(TeamRole), nullable=False, default=TeamRole.VIEWER)
    status = Column(Enum(MemberStatus), nullable=False, default=MemberStatus.INVITED)
    permissions = Column(JSON, default=list, nullable=False)

    invited_at = Column(DateTime(timezone=True), nullable=True)
    joined_at = Column(DateTime(timezone=True), nullable=True)
    last_active_at = Column(DateTime(timezone=True), nullable=True)

    # Invite-acceptance: a hashed, expiring token (never store the raw token —
    # same convention as API keys, see app.core.security.hash_api_key). Set on
    # invite()/resend_invite(), cleared once accept_invite() succeeds.
    invite_token_hash = Column(String(64), nullable=True, index=True)
    invite_expires_at = Column(DateTime(timezone=True), nullable=True)

    # who invited them / which user this member maps to (if they have a login)
    inviter_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    inviter = relationship("User", foreign_keys=[inviter_id])
