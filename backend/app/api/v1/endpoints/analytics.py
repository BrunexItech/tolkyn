from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.analytics import (
    Overview,
    PlatformList,
    PlatformRow,
    TimeSeries,
    TopPost,
    TopPostList,
)
from app.services.analytics_service import AnalyticsService
from app.services.reports_service import build_metrics_report_pdf

router = APIRouter()


@router.get("/overview", response_model=Overview)
async def overview(
    days: int = Query(30, ge=7, le=90),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return Overview(**await AnalyticsService(db, user_id).overview(days))


@router.get("/timeseries", response_model=TimeSeries)
async def timeseries(
    days: int = Query(30, ge=7, le=90),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return TimeSeries(**await AnalyticsService(db, user_id).timeseries(days))


@router.get("/by-platform", response_model=PlatformList)
async def by_platform(
    days: int = Query(30, ge=7, le=90),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await AnalyticsService(db, user_id).by_platform(days)
    return PlatformList(items=[PlatformRow(**r) for r in rows])


@router.get("/top-posts", response_model=TopPostList)
async def top_posts(
    limit: int = Query(8, ge=1, le=25),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    rows = await AnalyticsService(db, user_id).top_posts(limit)
    return TopPostList(items=[TopPost(**r) for r in rows])


@router.get("/report")
async def download_report(
    start: date = Query(..., description="Start of the reporting period (inclusive)"),
    end: date = Query(..., description="End of the reporting period (inclusive)"),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """A downloadable, styled PDF covering social/content + messaging (SMS,
    WhatsApp, Email) metrics for this workspace over the given date range."""
    days = max(1, (end - start).days + 1)
    svc = AnalyticsService(db, user_id)
    ov = await svc.overview(days)
    platforms = await svc.by_platform(days)
    reach_engagement = {"provider": ov["provider"], "platforms": platforms}
    pdf_bytes = await build_metrics_report_pdf(db, user_id, start, end, reach_engagement)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="tolkyn-report-{start}-to-{end}.pdf"'},
    )
