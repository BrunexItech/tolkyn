"""Resolves the effective workspace + role for whoever is making a request.

A workspace is normally just `user_id == workspace_id` — the single-owner
case, true for every account that predates the Team feature and unchanged by
any of this. A user who accepted a team invite instead has an ACTIVE
TeamMember row whose `user_id` is their own login but whose `workspace_id`
points at the person who invited them — that's the only case where "who is
logged in" and "whose data to use" diverge.
"""
from dataclasses import dataclass, field
from typing import List

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.features import ALL_MODULES, MODULES
from app.core.security import get_current_user_id
from app.db import get_db
from app.models.package import Package
from app.models.team_member import ROLE_PERMISSIONS, MemberStatus, TeamMember, TeamRole
from app.models.user import User


@dataclass(frozen=True)
class Actor:
    user_id: str                                       # who is really logged in — attribution
    workspace_id: str                                   # whose data this request reads/writes
    role: TeamRole = TeamRole.OWNER
    permissions: List[str] = field(default_factory=lambda: ["*"])
    # Platform modules the workspace's package grants. ["*"] = everything /
    # grandfathered (no package assigned). See app.core.features.
    features: List[str] = field(default_factory=lambda: ["*"])

    def has(self, perm: str) -> bool:
        return "*" in self.permissions or perm in self.permissions

    def can_use(self, module: str) -> bool:
        return "*" in self.features or module in self.features


async def _workspace_features(db: AsyncSession, workspace_id: str) -> List[str]:
    """The modules the workspace owner can reach. A workspace_id is always a
    user id (the owner, or the inviter for a team member).

    = the owner's package modules, then the owner's per-user `module_overrides`
    applied on top ({"crm": true} force-grants, {"video": false} force-removes).
    No package assigned → grandfathered to everything (then overrides still
    apply, so a super admin can still switch a single module off).
    """
    res = (
        await db.execute(
            select(Package.modules, User.module_overrides)
            .select_from(User)
            .outerjoin(Package, Package.id == User.package_id)
            .where(User.id == workspace_id)
        )
    ).first()
    if res is None:
        return ["*"]

    pkg_modules, overrides = res
    overrides = overrides or {}

    if pkg_modules is None or "*" in pkg_modules:
        granted = set(ALL_MODULES)
    else:
        granted = {m for m in pkg_modules if m in MODULES}

    for mod, on in overrides.items():
        if mod not in MODULES:
            continue
        granted.add(mod) if on else granted.discard(mod)

    # still report "*" when nothing was actually narrowed, so require_feature's
    # cheap "*" short-circuit keeps working for the common untouched account
    if not overrides and (pkg_modules is None or "*" in pkg_modules):
        return ["*"]
    return sorted(granted)


async def get_actor(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Actor:
    res = await db.execute(
        select(TeamMember)
        .where(TeamMember.user_id == user_id, TeamMember.status == MemberStatus.ACTIVE)
        .order_by(TeamMember.created_at.asc())
    )
    # .first(), not .scalar_one_or_none(): a rare pre-existing race in
    # ensure_owner()'s check-then-insert can leave more than one ACTIVE
    # owner-row for the same user_id/workspace_id — all identical in
    # practice, so taking the oldest is correct and must never 500 here.
    member = res.scalars().first()
    if not member or member.workspace_id == user_id:
        # No team membership, or it's the workspace owner's own auto-created
        # row (TeamService.ensure_owner()) — the ordinary case, identical to
        # every account's behavior before the Team feature existed.
        return Actor(
            user_id=user_id,
            workspace_id=user_id,
            role=TeamRole.OWNER,
            permissions=["*"],
            features=await _workspace_features(db, user_id),
        )
    return Actor(
        user_id=user_id,
        workspace_id=member.workspace_id,
        role=member.role,
        permissions=member.permissions or ROLE_PERMISSIONS.get(member.role.value, []),
        features=await _workspace_features(db, member.workspace_id),
    )


async def get_workspace_id(actor: Actor = Depends(get_actor)) -> str:
    """Drop-in replacement for `get_current_user_id` wherever an endpoint only
    needs to know which tenant's data to read/write, not specifically who is
    acting. Every workspace-scoped service in the app used to receive the raw
    actor id for exactly this purpose; this resolves it correctly for a team
    member acting inside someone else's workspace, and is a no-op (returns
    the same value `get_current_user_id` would have) for everyone else."""
    return actor.workspace_id


def require_permission(name: str):
    """FastAPI dependency factory: 403s unless the acting identity's role
    grants `name`. OWNER always passes. Everyone else is checked against
    their TeamMember.permissions (falls back to the role's default set from
    ROLE_PERMISSIONS if the row predates a permission-set change)."""

    async def _check(actor: Actor = Depends(get_actor)) -> Actor:
        if actor.role == TeamRole.OWNER or actor.has(name):
            return actor
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Your role doesn't include '{name}' access.")

    return _check


def require_feature(*modules: str):
    """FastAPI dependency: 403s unless the workspace's package grants at least
    one of `modules`. Applied at the router level (see api/v1/__init__.py) to
    gate whole sections of the platform by pricing tier."""

    async def _check(actor: Actor = Depends(get_actor)) -> Actor:
        if any(actor.can_use(m) for m in modules):
            return actor
        label = " / ".join(MODULES.get(m, m) for m in modules)
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, f"Your plan doesn't include {label}. Contact the platform administrator to upgrade."
        )

    return _check
