"""Lets a "main account" switch which workspace its session acts as, among
the subsidiaries a super admin has explicitly linked to it (see
app.core.actor.get_actor for how the switch actually takes effect on every
subsequent request). Dormant for every account with no subsidiaries --
list_workspaces() then just returns the account's own single entry, and the
frontend switcher doesn't render at all in that case.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import valid_subsidiary_target
from app.models.organization import Organization, OrganizationStatus, Subsidiary, SubsidiaryStatus
from app.models.user import User


async def list_workspaces(db: AsyncSession, user_id: str) -> List[Dict[str, Any]]:
    me = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not me:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    current = me.acting_as_workspace_id or user_id
    out: List[Dict[str, Any]] = [
        {
            "workspace_id": user_id,
            "name": me.name or me.email,
            "is_self": True,
            "is_current": current == user_id,
        }
    ]

    rows = await db.execute(
        select(Subsidiary.workspace_id, Subsidiary.name)
        .join(Organization, Organization.id == Subsidiary.organization_id)
        .where(
            Organization.owner_user_id == user_id,
            Organization.status == OrganizationStatus.ACTIVE,
            Subsidiary.status == SubsidiaryStatus.ACTIVE,
            Subsidiary.workspace_id.isnot(None),
        )
    )
    for workspace_id, name in rows.all():
        out.append({
            "workspace_id": workspace_id,
            "name": name,
            "is_self": False,
            "is_current": current == workspace_id,
        })
    return out


async def activate_workspace(db: AsyncSession, user_id: str, target_workspace_id: str) -> None:
    if target_workspace_id != user_id and not await valid_subsidiary_target(db, user_id, target_workspace_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "That workspace isn't a subsidiary linked to your account.",
        )
    me = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not me:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    # Store None for "acting as self" rather than the redundant literal
    # user_id -- keeps the common case (no active switch) cheap to check.
    me.acting_as_workspace_id = target_workspace_id if target_workspace_id != user_id else None
    await db.commit()
