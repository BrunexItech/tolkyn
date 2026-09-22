from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.services.email_campaign_service import EmailCampaignService, parse_email_csv

router = APIRouter()


class ManualRecipient(BaseModel):
    email: str
    name: str = ""


class RecipientPreviewRequest(BaseModel):
    source: str  # manual | leads | customers
    ids: Optional[List[str]] = None
    manual: Optional[List[ManualRecipient]] = None


class RecipientPreview(BaseModel):
    count: int
    sample: List[dict]


class SendCampaignRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    email_account_id: Optional[str] = None
    source: str = "manual"
    ids: Optional[List[str]] = None
    manual: Optional[List[ManualRecipient]] = None
    reply_to: Optional[str] = Field(
        None, max_length=255, description="Where customer replies to this blast land"
    )


class CsvImportResult(BaseModel):
    recipients: List[ManualRecipient]
    imported: int
    skipped: int
    columns: List[str] = []


class CampaignRow(BaseModel):
    id: str
    subject: str
    source: str
    reply_to: Optional[str] = None
    total: int
    sent: int
    failed: int
    skipped: int
    status: str
    created_at: datetime


class CampaignSendRow(BaseModel):
    to_email: str
    status: str
    error: Optional[str] = None
    sent_at: Optional[datetime] = None


@router.get("/campaigns", response_model=List[CampaignRow])
async def list_campaigns(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailCampaignService(db, user_id).history()


@router.get("/campaigns/{campaign_id}/sends", response_model=List[CampaignSendRow])
async def campaign_sends(
    campaign_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailCampaignService(db, user_id).campaign_sends(campaign_id)


@router.post("/recipients/preview", response_model=RecipientPreview)
async def preview_recipients(
    body: RecipientPreviewRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    recips = await EmailCampaignService(db, user_id).resolve_recipients(
        body.source,
        ids=body.ids,
        manual=[m.model_dump() for m in body.manual] if body.manual else None,
    )
    return RecipientPreview(count=len(recips), sample=recips[:8])


@router.post("/recipients/import-csv", response_model=CsvImportResult)
async def import_recipients_csv(
    file: UploadFile = File(...),
    user_id: str = Depends(get_workspace_id),
):
    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 5 MB)")
    return CsvImportResult(**parse_email_csv(raw))


@router.post("/campaigns", response_model=CampaignRow)
async def send_campaign(
    body: SendCampaignRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailCampaignService(db, user_id).send(
        subject=body.subject,
        body=body.body,
        email_account_id=body.email_account_id,
        source=body.source,
        ids=body.ids,
        manual=[m.model_dump() for m in body.manual] if body.manual else None,
        reply_to=body.reply_to,
    )
