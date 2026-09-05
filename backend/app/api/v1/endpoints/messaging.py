from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.core.internal_auth import verify_internal_secret
from app.db import get_db
from app.schemas.messaging import (
    BroadcastCreate,
    BroadcastList,
    BroadcastResponse,
    BroadcastUpdate,
    CampaignGroupCreate,
    CampaignGroupCreateResult,
    CampaignGroupDetail,
    CampaignGroupList,
    CampaignGroupResponse,
    CampaignGroupSendMessage,
    ContactList,
    CsvImportResult,
    MessagingSummary,
    WhatsAppWebHistoryWebhook,
    WhatsAppWebMessageWebhook,
    WhatsAppWebStatus,
    WhatsAppWebStatusWebhook,
)
from app.services import whatsapp_web_service
from app.services.campaign_group_service import CampaignGroupService
from app.services.messaging_service import MessagingService
from app.services.whatsapp_web_ingest import ingest_history_batch, ingest_message
from app.services.whatsapp_web_service import WhatsAppWebError

router = APIRouter()
# Webhook routes (worker -> backend, shared-secret auth). Registered without
# the plan/feature gate that the user-facing `router` gets.
webhook_router = APIRouter()


@router.get("/summary", response_model=MessagingSummary)
async def summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return MessagingSummary(**await MessagingService(db, user_id).summary())


@router.get("/contacts", response_model=ContactList)
async def contacts(
    search: str = Query("", max_length=120),
    source: str = Query("all", pattern="^(all|lead|customer)$"),
    status: str | None = Query(None, max_length=40),
    score: str | None = Query(None, max_length=20),
    target_area_ids: list[str] = Query(default_factory=list),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await MessagingService(db, user_id).contacts(
        search=search, source=source, status=status, score=score, target_area_ids=target_area_ids or None
    )
    return ContactList(items=items)


@router.post("/contacts/import", response_model=CsvImportResult)
async def import_contacts_csv(
    file: UploadFile = File(...),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    raw = await file.read()
    if len(raw) > 5_000_000:
        from fastapi import HTTPException, status as st
        raise HTTPException(st.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 5 MB)")
    return CsvImportResult(**MessagingService(db, user_id).import_csv(raw))


@router.get("/broadcasts", response_model=BroadcastList)
async def list_broadcasts(
    channel: str | None = Query(None, pattern="^(sms|whatsapp)$"),
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await MessagingService(db, user_id).list(channel)
    return BroadcastList(items=[BroadcastResponse.model_validate(b) for b in items])


@router.post("/broadcasts", response_model=BroadcastResponse, status_code=status.HTTP_201_CREATED)
async def create_broadcast(
    body: BroadcastCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    b = await MessagingService(db, user_id).create(body.model_dump(mode="json"))
    return BroadcastResponse.model_validate(b)


@router.get("/broadcasts/{bid}", response_model=BroadcastResponse)
async def get_broadcast(
    bid: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return BroadcastResponse.model_validate(await MessagingService(db, user_id).get(bid))


@router.patch("/broadcasts/{bid}", response_model=BroadcastResponse)
async def update_broadcast(
    bid: str,
    body: BroadcastUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    b = await MessagingService(db, user_id).update(bid, body.model_dump(mode="json", exclude_unset=True))
    return BroadcastResponse.model_validate(b)


@router.delete("/broadcasts/{bid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_broadcast(
    bid: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await MessagingService(db, user_id).delete(bid)


@router.post("/broadcasts/{bid}/send", response_model=BroadcastResponse)
async def send_broadcast(
    bid: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return BroadcastResponse.model_validate(await MessagingService(db, user_id).send(bid))


# --------------------------------------------------------------------------
# Self-hosted WhatsApp Web (Baileys worker) — unofficial, at-your-own-risk
# path while waiting on real Cloud API access. One session per workspace.
# --------------------------------------------------------------------------


@router.post("/whatsapp-web/connect", response_model=WhatsAppWebStatus)
async def connect_whatsapp_web(user_id: str = Depends(get_workspace_id)):
    try:
        return WhatsAppWebStatus(**await whatsapp_web_service.connect(user_id))
    except WhatsAppWebError as exc:
        raise HTTPException(502, f"WhatsApp worker: {exc.message}")


@router.get("/whatsapp-web/status", response_model=WhatsAppWebStatus)
async def whatsapp_web_status(user_id: str = Depends(get_workspace_id)):
    try:
        return WhatsAppWebStatus(**await whatsapp_web_service.status(user_id))
    except WhatsAppWebError:
        # Worker unreachable or session never started — same meaning to the
        # caller either way: nothing connected yet.
        return WhatsAppWebStatus(status="disconnected")


@router.delete("/whatsapp-web/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_whatsapp_web(user_id: str = Depends(get_workspace_id)):
    await whatsapp_web_service.disconnect(user_id)


@webhook_router.post("/whatsapp-web/webhook/message", status_code=status.HTTP_204_NO_CONTENT)
async def whatsapp_web_message_webhook(
    body: WhatsAppWebMessageWebhook,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_secret),
):
    # Always lands in the real Inbox/CRM for the admin, regardless of
    # whether it's also a campaign-group reply — full visibility is exactly
    # what the admin gets that other participants don't.
    await ingest_message(
        db,
        body.workspace_id,
        external_id=body.external_id,
        from_phone=body.from_,
        from_name=body.from_name,
        body=body.body,
        at_ms=body.at,
        from_jid=body.from_jid,
        from_pn=body.from_pn,
    )
    # A campaign participant is keyed by the real phone the admin typed, so try
    # that first; fall back to the raw addressing key for good measure.
    await CampaignGroupService(db, body.workspace_id).relay_reply(
        body.from_pn or body.from_, body.body
    )


@webhook_router.post("/whatsapp-web/webhook/status", status_code=status.HTTP_204_NO_CONTENT)
async def whatsapp_web_status_webhook(
    body: WhatsAppWebStatusWebhook,
    _: None = Depends(verify_internal_secret),
):
    # Nothing to persist — GET /whatsapp-web/status asks the worker directly
    # for real-time truth. This exists so the worker always has somewhere to
    # report to, and so a future "notify the owner when disconnected" email
    # has a single place to hook in.
    print(f"[whatsapp-web] workspace={body.workspace_id} status={body.status}")


@webhook_router.post("/whatsapp-web/webhook/history", status_code=status.HTTP_204_NO_CONTENT)
async def whatsapp_web_history_webhook(
    body: WhatsAppWebHistoryWebhook,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_secret),
):
    await ingest_history_batch(
        db, body.workspace_id, [m.model_dump() for m in body.messages]
    )


# --------------------------------------------------------------------------
# Campaign groups ("communities") — a shared conversation over WhatsApp
# where every participant sees the others only under a pseudo-name. See
# app.services.campaign_group_service for why this isn't a native WhatsApp
# group (that can't reliably guarantee hidden numbers).
# --------------------------------------------------------------------------


@router.get("/campaign-groups", response_model=CampaignGroupList)
async def list_campaign_groups(user_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)):
    items = await CampaignGroupService(db, user_id).list()
    return CampaignGroupList(items=[CampaignGroupResponse.model_validate(g) for g in items])


@router.post("/campaign-groups", response_model=CampaignGroupCreateResult, status_code=status.HTTP_201_CREATED)
async def create_campaign_group(
    body: CampaignGroupCreate, user_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)
):
    group, errors = await CampaignGroupService(db, user_id).create(
        body.name, [r.model_dump() for r in body.recipients], owner_id=user_id, initial_message=body.initial_message
    )
    return CampaignGroupCreateResult(group=CampaignGroupResponse.model_validate(group), send_errors=errors)


@router.get("/campaign-groups/{group_id}", response_model=CampaignGroupDetail)
async def get_campaign_group(
    group_id: str, user_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)
):
    return CampaignGroupDetail.model_validate(await CampaignGroupService(db, user_id).get(group_id))


@router.post("/campaign-groups/{group_id}/messages", response_model=CampaignGroupDetail)
async def send_campaign_group_message(
    group_id: str,
    body: CampaignGroupSendMessage,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    group, errors = await CampaignGroupService(db, user_id).send_message(group_id, body.body)
    detail = CampaignGroupDetail.model_validate(group)
    detail.send_errors = errors
    return detail
