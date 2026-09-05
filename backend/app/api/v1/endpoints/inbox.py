from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.inbox import (
    AssignRequest,
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


def _summary(t) -> ThreadSummary:
    d = ThreadSummary.model_validate(t)
    d.preview = _preview(t)
    d.like_count = _like_count(t)
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
    return ThreadList(items=[_summary(t) for t in threads])


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
    return ThreadList(items=[_summary(t) for t in await svc.list_threads()])


@router.get("/{thread_id}", response_model=ThreadDetail)
async def get_thread(
    thread_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = InboxService(db, user_id)
    t = await svc.mark_read(thread_id)
    t = await svc.get_thread(thread_id)
    d = ThreadDetail.model_validate(t)
    d.preview = _preview(t)
    d.like_count = _like_count(t)
    return d


@router.post("/{thread_id}/reply", response_model=ThreadDetail)
async def reply(
    thread_id: str,
    body: ReplyRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    t = await InboxService(db, user_id).reply(thread_id, body.body, body.via)
    d = ThreadDetail.model_validate(t)
    d.preview = _preview(t)
    d.like_count = _like_count(t)
    return d


@router.post("/{thread_id}/status", response_model=ThreadSummary)
async def set_status(
    thread_id: str,
    body: StatusRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    t = await InboxService(db, user_id).set_status(thread_id, body.status.value)
    return _summary(await InboxService(db, user_id).get_thread(thread_id))


@router.post("/{thread_id}/assign", response_model=ThreadSummary)
async def assign(
    thread_id: str,
    body: AssignRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await InboxService(db, user_id).assign(thread_id, body.assignee)
    return _summary(await InboxService(db, user_id).get_thread(thread_id))
