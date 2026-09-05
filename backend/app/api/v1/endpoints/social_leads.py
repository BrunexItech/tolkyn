from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.social_lead import (
    ConvertSocialLeadRequest,
    ScanResponse,
    SocialLeadList,
    SocialLeadReplyRequest,
    SocialLeadResponse,
    SocialLeadStatusRequest,
    SocialLeadSummary,
)
from app.services.social_lead_service import SocialLeadService

router = APIRouter()


@router.get("", response_model=SocialLeadList)
async def list_social_leads(
    status: Optional[str] = None,
    intent: Optional[str] = None,
    platform: Optional[str] = None,
    leads_only: Optional[bool] = None,
    search: Optional[str] = Query(None, min_length=1),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = SocialLeadService(db, user_id)
    items, total = await svc.list(
        status_filter=status,
        intent=intent,
        platform=platform,
        leads_only=leads_only,
        search=search,
        limit=limit,
        offset=offset,
    )
    return SocialLeadList(
        items=[SocialLeadResponse.model_validate(i) for i in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/summary", response_model=SocialLeadSummary)
async def social_lead_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return SocialLeadSummary(**await SocialLeadService(db, user_id).summary())


@router.post("/scan", response_model=ScanResponse)
async def scan_social_leads(
    force: bool = Query(True),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return ScanResponse(**await SocialLeadService(db, user_id).scan(force=force))


@router.get("/{lead_id}", response_model=SocialLeadResponse)
async def get_social_lead(
    lead_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return SocialLeadResponse.model_validate(await SocialLeadService(db, user_id).get(lead_id))


@router.post("/{lead_id}/status", response_model=SocialLeadResponse)
async def set_social_lead_status(
    lead_id: str,
    body: SocialLeadStatusRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    row = await SocialLeadService(db, user_id).set_status(lead_id, body.status.value)
    return SocialLeadResponse.model_validate(row)


@router.post("/{lead_id}/reclassify", response_model=SocialLeadResponse)
async def reclassify_social_lead(
    lead_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return SocialLeadResponse.model_validate(
        await SocialLeadService(db, user_id).reclassify(lead_id)
    )


@router.post("/{lead_id}/reply", response_model=SocialLeadResponse)
async def reply_social_lead(
    lead_id: str,
    body: SocialLeadReplyRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return SocialLeadResponse.model_validate(
        await SocialLeadService(db, user_id).reply(lead_id, body.body)
    )


@router.post("/{lead_id}/convert")
async def convert_social_lead(
    lead_id: str,
    body: ConvertSocialLeadRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await SocialLeadService(db, user_id).convert(lead_id, body)
