from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import Actor, get_actor, require_permission
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db import get_db
from app.schemas.auth import AuthResponse
from app.schemas.team import (
    AcceptInviteRequest,
    InvitePreview,
    InviteRequest,
    InviteResponse,
    MemberList,
    MemberResponse,
    MemberUpdate,
    MeResponse,
    TeamSummary,
)
from app.services.team_service import TeamService

router = APIRouter()


@router.get("", response_model=MemberList)
async def list_members(
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    items = await TeamService(db, actor).list()
    return MemberList(items=[MemberResponse.model_validate(m) for m in items])


@router.get("/summary", response_model=TeamSummary)
async def team_summary(
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    return TeamSummary(**await TeamService(db, actor).summary())


@router.get("/me", response_model=MeResponse)
async def my_role(
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    """Lets the frontend hide actions a team member's role doesn't grant,
    proactively rather than only reacting to a 403 after the fact."""
    return MeResponse(**TeamService(db, actor).me())


@router.post("", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    body: InviteRequest,
    actor: Actor = Depends(require_permission("team")),
    db: AsyncSession = Depends(get_db),
):
    m, link = await TeamService(db, actor).invite(body.model_dump(mode="json"))
    return InviteResponse(member=MemberResponse.model_validate(m), invite_link=link)


@router.patch("/{mid}", response_model=MemberResponse)
async def update_member(
    mid: str,
    body: MemberUpdate,
    actor: Actor = Depends(require_permission("team")),
    db: AsyncSession = Depends(get_db),
):
    m = await TeamService(db, actor).update(mid, body.model_dump(mode="json", exclude_unset=True))
    return MemberResponse.model_validate(m)


@router.post("/{mid}/resend", response_model=InviteResponse)
async def resend_invite(
    mid: str,
    actor: Actor = Depends(require_permission("team")),
    db: AsyncSession = Depends(get_db),
):
    m, link = await TeamService(db, actor).resend_invite(mid)
    return InviteResponse(member=MemberResponse.model_validate(m), invite_link=link)


@router.delete("/{mid}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    mid: str,
    actor: Actor = Depends(require_permission("team")),
    db: AsyncSession = Depends(get_db),
):
    await TeamService(db, actor).remove(mid)


# --------------------------------------------------------------------------
# Invite acceptance — public, pre-auth. The invitee has no login yet, so
# these cannot depend on get_actor/get_current_user_id.
# --------------------------------------------------------------------------


@router.get("/invite/{token}", response_model=InvitePreview)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def preview_invite(request: Request, token: str, db: AsyncSession = Depends(get_db)):
    return InvitePreview(**await TeamService.preview_invite(db, token))


@router.post("/invite/{token}/accept", response_model=AuthResponse)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def accept_invite(
    request: Request, token: str, body: AcceptInviteRequest, db: AsyncSession = Depends(get_db)
):
    return await TeamService.accept_invite(db, token, body.password, body.name)
