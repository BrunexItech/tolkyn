import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_context import note_activity
from app.core.actor import Actor
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_api_key,
)
from app.models.team_member import (
    ROLE_PERMISSIONS,
    MemberStatus,
    TeamMember,
    TeamRole,
)
from app.models.user import User, UserStatus
from app.schemas.auth import AuthResponse, TokenResponse, UserResponse
from app.services.email_sender import SmtpConfig, send_email

_PALETTE = ["#4f7aff", "#22b8cf", "#37b24d", "#f59f00", "#e64980", "#7048e8", "#f03e3e"]
_INVITE_TTL_DAYS = 7


def _color_for(seed: str) -> str:
    return _PALETTE[sum(ord(c) for c in seed) % len(_PALETTE)]


def _smtp_config() -> Optional[SmtpConfig]:
    """None when the workspace-agnostic system SMTP isn't configured — every
    call site falls back to a copyable invite link in that case rather than
    pretending an email went out."""
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD):
        return None
    return SmtpConfig(
        host=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        from_email=settings.SMTP_FROM_EMAIL,
        from_name=settings.SMTP_FROM_NAME,
    )


class TeamService:
    def __init__(self, db: AsyncSession, actor: Actor):
        self.db = db
        self.actor = actor
        self.user_id = actor.user_id
        self.workspace_id = actor.workspace_id

    async def _owner_user(self) -> User:
        res = await self.db.execute(select(User).where(User.id == self.workspace_id))
        u = res.scalar_one_or_none()
        if not u:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        return u

    async def ensure_owner(self) -> None:
        """The workspace owner is always member #1. Concurrent first-load
        requests can all reach here at once, so the insert is guarded by the
        (workspace_id, user_id) unique index — a loser just rolls back."""
        res = await self.db.execute(
            select(TeamMember.id).where(
                TeamMember.workspace_id == self.workspace_id,
                TeamMember.role == TeamRole.OWNER,
            )
        )
        if res.first():
            return
        u = await self._owner_user()
        m = TeamMember(
            email=u.email,
            name=u.name,
            title=u.position or "Owner",
            avatar_color=_color_for(u.email),
            role=TeamRole.OWNER,
            status=MemberStatus.ACTIVE,
            permissions=["*"],
            joined_at=u.created_at or datetime.now(timezone.utc),
            last_active_at=datetime.now(timezone.utc),
            inviter_id=u.id,
            user_id=u.id,
            workspace_id=self.workspace_id,
        )
        self.db.add(m)
        try:
            await self.db.commit()
        except IntegrityError:
            # Another concurrent request already inserted the owner row.
            await self.db.rollback()

    async def list(self) -> List[TeamMember]:
        await self.ensure_owner()
        res = await self.db.execute(
            select(TeamMember)
            .where(TeamMember.workspace_id == self.workspace_id)
            .order_by(TeamMember.created_at.asc())
        )
        rows = list(res.scalars().all())
        # Defensive: collapse any legacy duplicate rows (same user_id) that
        # predate the unique index — keep the first (oldest) of each.
        seen: set[str] = set()
        out: List[TeamMember] = []
        for m in rows:
            key = m.user_id or m.id
            if key in seen:
                continue
            seen.add(key)
            out.append(m)
        return out

    async def get(self, mid: str) -> TeamMember:
        res = await self.db.execute(
            select(TeamMember).where(
                TeamMember.id == mid, TeamMember.workspace_id == self.workspace_id
            )
        )
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
        return m

    async def me(self) -> Dict[str, Any]:
        """The acting identity's own role/permissions/features + today's AI-
        generation usage — lets the frontend hide actions and show remaining
        allowance proactively, rather than only reacting to a 403/429."""
        from sqlalchemy import select as _select

        from app.core.limits import count_today, effective_daily_limit
        from app.models.user import User

        ws = self.actor.workspace_id
        owner = (await self.db.execute(_select(User).where(User.id == ws))).scalar_one_or_none()
        img_used = await count_today(self.db, ws, "image")
        vid_used = await count_today(self.db, ws, "video")
        return {
            "user_id": self.actor.user_id,
            "workspace_id": ws,
            "role": self.actor.role.value,
            "permissions": self.actor.permissions,
            "features": self.actor.features,
            "is_owner": self.actor.role == TeamRole.OWNER,
            "images_today": img_used,
            "images_daily_limit": effective_daily_limit(owner, "image") if owner else None,
            "videos_today": vid_used,
            "videos_daily_limit": effective_daily_limit(owner, "video") if owner else None,
        }

    # ------------------------------------------------------------ inviting
    async def invite(self, data: Dict[str, Any]) -> Tuple[TeamMember, Optional[str]]:
        """Returns (member, invite_link). invite_link is None when a real
        email was sent; non-None means SMTP isn't configured and the caller
        (the frontend) should show it as a copyable fallback instead."""
        email = data["email"].strip().lower()
        role = TeamRole(data.get("role", "viewer"))
        if role == TeamRole.OWNER:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A workspace has one owner")
        res = await self.db.execute(
            select(TeamMember).where(
                TeamMember.workspace_id == self.workspace_id, TeamMember.email == email
            )
        )
        if res.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, "That email is already on the team")

        m = TeamMember(
            email=email,
            name=data.get("name") or email.split("@")[0].title(),
            title=data.get("title"),
            avatar_color=_color_for(email),
            role=role,
            status=MemberStatus.INVITED,
            permissions=ROLE_PERMISSIONS.get(role.value, []),
            invited_at=datetime.now(timezone.utc),
            inviter_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        raw_token = self._issue_invite_token(m)
        self.db.add(m)
        await self.db.commit()
        await self.db.refresh(m)

        link = f"{settings.FRONTEND_URL.rstrip('/')}/accept-invite/{raw_token}"
        sent = await self._send_invite_email(m, link)
        note_activity("team.invite", member_id=m.id, email=m.email, role=m.role.value)
        return m, (None if sent else link)

    @staticmethod
    def _issue_invite_token(m: TeamMember) -> str:
        raw = secrets.token_urlsafe(32)
        m.invite_token_hash = hash_api_key(raw)
        m.invite_expires_at = datetime.now(timezone.utc) + timedelta(days=_INVITE_TTL_DAYS)
        return raw

    async def _send_invite_email(self, m: TeamMember, link: str) -> bool:
        cfg = _smtp_config()
        if not cfg:
            return False
        inviter = await self._owner_user()
        subject = f"{inviter.name or inviter.email} invited you to Tolkyn"
        body = (
            f"You've been invited to join {inviter.name or inviter.email}'s workspace on "
            f"Tolkyn as {m.role.value}.\n\nAccept your invite here:\n{link}\n\n"
            f"This link expires in {_INVITE_TTL_DAYS} days."
        )
        outcome = await send_email(cfg, m.email, subject, body)
        return outcome.ok

    async def resend_invite(self, mid: str) -> Tuple[TeamMember, Optional[str]]:
        m = await self.get(mid)
        if m.status != MemberStatus.INVITED:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That member has already joined")
        m.invited_at = datetime.now(timezone.utc)
        raw_token = self._issue_invite_token(m)
        await self.db.commit()
        await self.db.refresh(m)
        link = f"{settings.FRONTEND_URL.rstrip('/')}/accept-invite/{raw_token}"
        sent = await self._send_invite_email(m, link)
        note_activity("team.resend_invite", member_id=m.id, email=m.email)
        return m, (None if sent else link)

    # ------------------------------------------------------ acceptance (pre-auth)
    @staticmethod
    async def preview_invite(db: AsyncSession, token: str) -> Dict[str, Any]:
        """Public: what an invite link is for, before the invitee has an
        account — email/role/who invited them, no auth required."""
        member = await TeamService._member_for_token(db, token)
        inviter = (
            await db.execute(select(User).where(User.id == member.inviter_id))
        ).scalar_one_or_none()
        return {
            "email": member.email,
            "role": member.role.value,
            "workspace_name": (inviter.name if inviter else None) or "this workspace",
            "inviter_name": inviter.name if inviter else None,
        }

    @staticmethod
    async def accept_invite(
        db: AsyncSession, token: str, password: str, name: Optional[str]
    ) -> AuthResponse:
        """Creates the invitee's own real login and links it to the
        TeamMember row so future requests resolve to the inviter's workspace
        (see app.core.actor.get_actor). Always creates a NEW User — if the
        email already has an account, this 409s rather than silently
        re-pointing an existing login at a second workspace (one login, one
        workspace, in this version)."""
        member = await TeamService._member_for_token(db, token)

        existing = (
            await db.execute(select(User).where(User.email == member.email))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "An account with this email already exists. Log in with that account instead "
                "of accepting this invite, or ask to be re-invited under a different email.",
            )

        user = User(
            name=name or member.name or member.email.split("@")[0].title(),
            email=member.email,
            password_hash=get_password_hash(password),
            status=UserStatus.ACTIVE,
            is_email_verified=True,       # vouched for by the inviter, not a stranger's self-signup
            is_approved=True,              # same reasoning — skips the anonymous-signup review gate
            workspace_id=member.workspace_id,
        )
        db.add(user)
        await db.flush()  # need user.id below without a second round trip

        member.user_id = user.id
        member.status = MemberStatus.ACTIVE
        member.joined_at = datetime.now(timezone.utc)
        member.last_active_at = datetime.now(timezone.utc)
        member.invite_token_hash = None
        member.invite_expires_at = None
        await db.commit()
        await db.refresh(user)

        note_activity("team.accept_invite", member_id=member.id, email=member.email)

        access_token = create_access_token({"sub": user.id})
        refresh_token = create_refresh_token({"sub": user.id})
        return AuthResponse(
            user=UserResponse(
                id=user.id, name=user.name, email=user.email, avatar=user.avatar, phone=user.phone,
                position=user.position, bio=user.bio, location=user.location, website=user.website,
                role=user.role, status=user.status, is_email_verified=user.is_email_verified,
                is_approved=user.is_approved, two_factor_enabled=user.two_factor_enabled,
                workspace_id=user.workspace_id, timezone=user.timezone, language=user.language,
                created_at=user.created_at, last_login_at=user.last_login_at,
            ),
            token=TokenResponse(
                access_token=access_token, refresh_token=refresh_token,
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            ),
        )

    @staticmethod
    async def _member_for_token(db: AsyncSession, token: str) -> TeamMember:
        token_hash = hash_api_key(token)
        res = await db.execute(
            select(TeamMember).where(TeamMember.invite_token_hash == token_hash)
        )
        member = res.scalar_one_or_none()
        if not member:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "This invite link isn't valid.")
        if member.status != MemberStatus.INVITED:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite has already been used.")
        if not member.invite_expires_at or member.invite_expires_at < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invite link has expired.")
        return member

    # ------------------------------------------------------------- managing
    async def update(self, mid: str, patch: Dict[str, Any]) -> TeamMember:
        m = await self.get(mid)
        if m.role == TeamRole.OWNER and (patch.get("role") or patch.get("status")):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The owner role cannot be changed")
        if "name" in patch and patch["name"] is not None:
            m.name = patch["name"]
        if "title" in patch and patch["title"] is not None:
            m.title = patch["title"]
        if patch.get("role"):
            role = TeamRole(patch["role"])
            if role == TeamRole.OWNER:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot promote to owner")
            from_role = m.role.value
            m.role = role
            m.permissions = ROLE_PERMISSIONS.get(role.value, [])
            note_activity("team.role_change", member_id=m.id, from_role=from_role, to_role=role.value)
        if patch.get("status"):
            new_status = MemberStatus(patch["status"])
            if new_status != m.status:
                note_activity(
                    "team.suspend" if new_status == MemberStatus.SUSPENDED else "team.reactivate",
                    member_id=m.id,
                )
            m.status = new_status
        m.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(m)
        return m

    async def remove(self, mid: str) -> None:
        m = await self.get(mid)
        if m.role == TeamRole.OWNER:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The owner cannot be removed")
        note_activity("team.remove", member_id=m.id, email=m.email)
        await self.db.delete(m)
        await self.db.commit()

    async def summary(self) -> Dict[str, Any]:
        members = await self.list()
        by_role: Dict[str, int] = {}
        for m in members:
            by_role[m.role.value] = by_role.get(m.role.value, 0) + 1
        return {
            "total": len(members),
            "active": sum(1 for m in members if m.status == MemberStatus.ACTIVE),
            "pending": sum(1 for m in members if m.status == MemberStatus.INVITED),
            "by_role": by_role,
            "roles": [
                {"id": r, "label": r.title(), "permissions": p}
                for r, p in ROLE_PERMISSIONS.items()
            ],
        }
