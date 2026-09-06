from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class TeamRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    EDITOR = "editor"
    ANALYST = "analyst"
    VIEWER = "viewer"


class MemberStatus(str, Enum):
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"


class InviteRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    title: Optional[str] = None
    role: TeamRole = TeamRole.VIEWER


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    role: Optional[TeamRole] = None
    status: Optional[MemberStatus] = None


class MemberResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    title: Optional[str] = None
    avatar_color: Optional[str] = None
    role: TeamRole
    status: MemberStatus
    permissions: List[str]
    invited_at: Optional[datetime] = None
    joined_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    workspace_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteResponse(BaseModel):
    """invite_link is non-null only when the system SMTP isn't configured —
    the frontend shows it as a copyable fallback instead of a delivery claim."""
    member: MemberResponse
    invite_link: Optional[str] = None


class MemberList(BaseModel):
    items: List[MemberResponse]


class TeamSummary(BaseModel):
    total: int
    active: int
    pending: int
    by_role: Dict[str, int]
    roles: List[Dict[str, Any]]


class MeResponse(BaseModel):
    user_id: str
    workspace_id: str
    role: TeamRole
    permissions: List[str]
    features: List[str] = ["*"]
    is_owner: bool
    # Today's AI-generation usage vs the effective daily cap (None = no cap).
    images_today: int = 0
    images_daily_limit: Optional[int] = None
    videos_today: int = 0
    videos_daily_limit: Optional[int] = None


class InvitePreview(BaseModel):
    email: str
    role: TeamRole
    workspace_name: str
    inviter_name: Optional[str] = None


class AcceptInviteRequest(BaseModel):
    name: Optional[str] = None
    password: str = Field(..., min_length=8, max_length=128)
    password_confirm: str

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v
