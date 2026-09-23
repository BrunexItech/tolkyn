from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.services.email_campaign_service import EmailCampaignService, parse_email_csv
from app.services.email_reply_service import EmailReplyService

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


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await EmailCampaignService(db, user_id).delete_campaign(campaign_id)


class AttachmentRow(BaseModel):
    filename: str
    url: str
    content_type: str
    size: int


class ReplyRow(BaseModel):
    id: str
    from_email: str
    from_name: Optional[str] = None
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    body_html: Optional[str] = None
    attachments: Optional[List[AttachmentRow]] = None
    received_at: Optional[datetime] = None
    is_read: bool


class UnreadCount(BaseModel):
    count: int


class ReplyToRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=20_000)
    email_account_id: Optional[str] = None


@router.get("/replies", response_model=List[ReplyRow])
async def list_replies(
    search: Optional[str] = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailReplyService(db, user_id).list(limit=limit, offset=offset, search=search)


@router.get("/replies/unread-count", response_model=UnreadCount)
async def replies_unread_count(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return UnreadCount(count=await EmailReplyService(db, user_id).unread_count())


@router.post("/replies/{reply_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_reply_read(
    reply_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await EmailReplyService(db, user_id).mark_read(reply_id)


@router.delete("/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reply(
    reply_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await EmailReplyService(db, user_id).delete(reply_id)


@router.post("/replies/{reply_id}/reply")
async def reply_to_message(
    reply_id: str,
    body: ReplyToRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await EmailReplyService(db, user_id).reply(reply_id, body.body, body.email_account_id)


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
    background_tasks: BackgroundTasks,
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
        background_tasks=background_tasks,
        reply_to=body.reply_to,
    )
