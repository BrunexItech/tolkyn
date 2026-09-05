from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.audience import (
    AudienceOverview,
    Contact,
    ContactPage,
    SegmentCreate,
    SegmentList,
    SegmentResponse,
)
from app.services.audience_service import AudienceService

router = APIRouter()


@router.get("/overview", response_model=AudienceOverview)
async def overview(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return AudienceOverview(**await AudienceService(db, user_id).overview())


@router.get("/contacts", response_model=ContactPage)
async def contacts(
    source: str = "all",
    country: Optional[str] = None,
    tag: Optional[str] = None,
    meta: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    filters = {k: v for k, v in {"country": country, "tag": tag, "meta": meta, "search": search}.items() if v}
    res = await AudienceService(db, user_id).contacts(source, filters, limit, offset)
    return ContactPage(items=[Contact(**c) for c in res["items"]], total=res["total"])


@router.get("/segments", response_model=SegmentList)
async def list_segments(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = AudienceService(db, user_id)
    segs = await svc.list_segments()
    out = []
    for s in segs:
        r = SegmentResponse.model_validate(s)
        r.count = await svc.segment_count(s)
        out.append(r)
    return SegmentList(items=out)


@router.post("/segments", response_model=SegmentResponse, status_code=status.HTTP_201_CREATED)
async def create_segment(
    body: SegmentCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = AudienceService(db, user_id)
    seg = await svc.create_segment(body.model_dump())
    r = SegmentResponse.model_validate(seg)
    r.count = await svc.segment_count(seg)
    return r


@router.delete("/segments/{seg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(
    seg_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await AudienceService(db, user_id).delete_segment(seg_id)
