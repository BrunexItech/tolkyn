from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.media_intel import (
    BriefRequest,
    BriefResponse,
    WatchList,
    WatchResponse,
)
from app.services.media_intel_service import MediaIntelService, build_brief

router = APIRouter()


@router.post("/brief", response_model=BriefResponse)
async def ad_hoc_brief(
    body: BriefRequest,
    _uid: str = Depends(get_workspace_id),
):
    """One-off intelligence brief for a topic (not saved)."""
    return BriefResponse(brief=await build_brief(body.topic, body.kind.value))


@router.get("/watchlist", response_model=WatchList)
async def list_watchlist(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await MediaIntelService(db, user_id).list_watches()
    return WatchList(items=[WatchResponse.model_validate(w) for w in items])


@router.post("/watchlist", response_model=WatchResponse, status_code=status.HTTP_201_CREATED)
async def add_watch(
    body: BriefRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    w = await MediaIntelService(db, user_id).add_watch(body.topic, body.kind.value)
    return WatchResponse.model_validate(w)


@router.post("/watchlist/{watch_id}/refresh", response_model=WatchResponse)
async def refresh_watch(
    watch_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    w = await MediaIntelService(db, user_id).refresh_watch(watch_id)
    return WatchResponse.model_validate(w)


@router.delete("/watchlist/{watch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watch(
    watch_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await MediaIntelService(db, user_id).delete_watch(watch_id)
