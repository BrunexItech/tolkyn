from typing import Iterable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import Actor, get_actor, get_workspace_id
from app.db import get_db
from app.models.team_member import TeamRole
from app.schemas.inbox import (
    AssignRequest,
    DeleteHistoryResult,
    InboxSummary,
    ReplyRequest,
    StatusRequest,
    ThreadDetail,
    ThreadList,
    ThreadSummary,
)
from app.services.inbox_service import InboxService

router = APIRouter()


def _preview(t) -> str:
    if getattr(t, "messages", None):
        return t.messages[-1].body[:140]
    return (t.context or "")[:140]


def _like_count(t) -> Optional[int]:
    if getattr(t, "messages", None):
        return t.messages[-1].like_count
    return None


def _summary(t, connected: Iterable[str]) -> ThreadSummary:
    d = ThreadSummary.model_validate(t)
    d.preview = _preview(t)
    d.like_count = _like_count(t)
    d.channel_connected = t.platform in connected
    return d


@router.get("", response_model=ThreadList)
async def list_threads(
    platform: Optional[str] = None,
    kind: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    assigned: Optional[bool] = None,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    threads = await svc.list_threads(
        platform=platform, kind=kind, status_filter=status, search=search, assigned=assigned
    )
    connected = await svc.connected_platform_set()
    return ThreadList(items=[_summary(t, connected) for t in threads])


@router.get("/summary", response_model=InboxSummary)
async def inbox_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return InboxSummary(**await InboxService(db, user_id).summary())


@router.post("/refresh", response_model=ThreadList)
async def refresh_inbox(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    await svc.refresh()
    threads = await svc.list_threads()
    connected = await svc.connected_platform_set()
    return ThreadList(items=[_summary(t, connected) for t in threads])


@router.get("/{thread_id}", response_model=ThreadDetail)
async def get_thread(
    thread_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    t = await svc.mark_read(thread_id)
    t = await svc.get_thread(thread_id)
    connected = await svc.connected_platform_set()
    d = ThreadDetail.model_validate(t)
    d.preview = _preview(t)
    d.like_count = _like_count(t)
    d.channel_connected = t.platform in connected
    return d


@router.post("/{thread_id}/reply", response_model=ThreadDetail)
async def reply(
    thread_id: str,
    body: ReplyRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    t = await svc.reply(thread_id, body.body, body.via)
    connected = await svc.connected_platform_set()
    d = ThreadDetail.model_validate(t)
    d.preview = _preview(t)
    d.like_count = _like_count(t)
    d.channel_connected = t.platform in connected
    return d


@router.post("/{thread_id}/status", response_model=ThreadSummary)
async def set_status(
    thread_id: str,
    body: StatusRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    await svc.set_status(thread_id, body.status.value)
    t = await svc.get_thread(thread_id)
    return _summary(t, await svc.connected_platform_set())


@router.post("/{thread_id}/assign", response_model=ThreadSummary)
async def assign(
    thread_id: str,
    body: AssignRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    await svc.assign(thread_id, body.assignee)
    t = await svc.get_thread(thread_id)
    return _summary(t, await svc.connected_platform_set())


@router.delete("/history/{platform}", response_model=DeleteHistoryResult)
async def delete_channel_history(
    platform: str,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    """Permanently deletes every thread + message this workspace has for
    `platform`. Owner-only, and only while that platform is disconnected
    (enforced in the service) — this is real, irreversible deletion."""
    if actor.role != TeamRole.OWNER:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Only the workspace owner can delete channel history.")
    deleted = await InboxService(db, actor.workspace_id).delete_channel_history(platform)
    return DeleteHistoryResult(platform=platform, deleted=deleted)
