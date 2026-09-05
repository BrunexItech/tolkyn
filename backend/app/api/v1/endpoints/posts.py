from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import Actor, get_actor, require_permission
from app.db import get_db
from app.schemas.post import (
    ChecksResult,
    PostCreate,
    PostList,
    PostResponse,
    PostUpdate,
    RejectRequest,
    ScheduleRequest,
)
from app.services.post_service import PostService

router = APIRouter()


@router.get("", response_model=PostList)
async def list_posts(
    status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await PostService(db, actor).list(status_filter=status, limit=limit, offset=offset)
    return PostList(items=[PostResponse.model_validate(p) for p in rows], total=total)


@router.get("/summary", response_model=dict)
async def posts_summary(
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    return await PostService(db, actor).summary()


@router.get("/calendar", response_model=PostList)
async def calendar(
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start = start or (now - timedelta(days=7))
    end = end or (now + timedelta(days=45))
    rows = await PostService(db, actor).calendar(start, end)
    return PostList(items=[PostResponse.model_validate(p) for p in rows], total=len(rows))


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    body: PostCreate,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).create(body.model_dump(mode="json"))
    return PostResponse.model_validate(post)


@router.post("/run-scheduler", response_model=dict)
async def run_scheduler(
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    n = await PostService(db, actor).run_due()
    return {"published": n}


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: str,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    return PostResponse.model_validate(await PostService(db, actor).get(post_id))


@router.patch("/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: str,
    body: PostUpdate,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).update(post_id, body.model_dump(mode="json", exclude_unset=True))
    return PostResponse.model_validate(post)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: str,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    await PostService(db, actor).delete(post_id)


@router.post("/{post_id}/check", response_model=ChecksResult)
async def check_post(
    post_id: str,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    return await PostService(db, actor).check(post_id)


@router.post("/{post_id}/schedule", response_model=PostResponse)
async def schedule_post(
    post_id: str,
    body: ScheduleRequest,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).schedule(post_id, body.scheduled_at, body.timezone)
    return PostResponse.model_validate(post)


@router.post("/{post_id}/unschedule", response_model=PostResponse)
async def unschedule_post(
    post_id: str,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).unschedule(post_id)
    return PostResponse.model_validate(post)


@router.post("/{post_id}/publish", response_model=PostResponse)
async def publish_post(
    post_id: str,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).publish(post_id)
    return PostResponse.model_validate(post)


@router.post("/{post_id}/approve", response_model=PostResponse)
async def approve_post(
    post_id: str,
    actor: Actor = Depends(require_permission("approvals")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).approve(post_id)
    return PostResponse.model_validate(post)


@router.post("/{post_id}/reject", response_model=PostResponse)
async def reject_post(
    post_id: str,
    body: RejectRequest,
    actor: Actor = Depends(require_permission("approvals")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).reject(post_id, body.reason)
    return PostResponse.model_validate(post)


@router.post("/{post_id}/refresh", response_model=PostResponse)
async def refresh_post_status(
    post_id: str,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).refresh_status(post_id)
    return PostResponse.model_validate(post)


@router.post("/{post_id}/retry", response_model=PostResponse)
async def retry_post(
    post_id: str,
    actor: Actor = Depends(require_permission("publish")),
    db: AsyncSession = Depends(get_db),
):
    post = await PostService(db, actor).retry(post_id)
    return PostResponse.model_validate(post)
