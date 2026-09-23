import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.core.config import settings
from app.core.internal_auth import verify_internal_secret
from app.db import get_db
from app.models.social_connection import ConnectionStatus, SocialConnection
from app.models.user import User
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
from app.services.sms_optout_service import detect_stop_keyword, record_stop_reply
from app.services.whatsapp_web_ingest import (
    classify_thread_now,
    ingest_history_batch,
    ingest_message,
)
from app.services.whatsapp_web_service import WhatsAppWebError

logger = logging.getLogger(__name__)

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
#
# Unlike the Upload-Post-backed channels, WhatsApp's own "is this session
# live" truth lives entirely on the worker (GET /status asks it directly).
# We still mirror a connected/disconnected flag into SocialConnection here —
# not as the source of truth for the QR/status UI, but so the Inbox can
# know, without calling the worker on every request, whether a thread's
# channel is currently live: gates replying to a disconnected WhatsApp
# thread and stops a stray webhook from creating messages after disconnect.
# --------------------------------------------------------------------------


async def _set_whatsapp_connection_status(db: AsyncSession, workspace_id: str, connected: bool) -> None:
    res = await db.execute(
        select(SocialConnection).where(
            SocialConnection.workspace_id == workspace_id, SocialConnection.platform == "whatsapp"
        )
    )
    conn = res.scalar_one_or_none()
    if conn is None:
        conn = SocialConnection(workspace_id=workspace_id, platform="whatsapp")
        db.add(conn)
    conn.status = ConnectionStatus.CONNECTED if connected else ConnectionStatus.DISCONNECTED
    now = datetime.now(timezone.utc)
    conn.last_synced_at = now
    if connected:
        conn.connected_at = conn.connected_at or now
    await db.commit()


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
async def disconnect_whatsapp_web(user_id: str = Depends(get_workspace_id), db: AsyncSession = Depends(get_db)):
    await whatsapp_web_service.disconnect(user_id)
    await _set_whatsapp_connection_status(db, user_id, connected=False)


@webhook_router.post("/whatsapp-web/webhook/message", status_code=status.HTTP_204_NO_CONTENT)
async def whatsapp_web_message_webhook(
    body: WhatsAppWebMessageWebhook,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_secret),
):
    # A stray/replayed event after the workspace disconnected WhatsApp must
    # not create new inbox data. Fail OPEN when there's no connection row at
    # all (nothing has ever recorded a status for this workspace, e.g. right
    # after this feature first deploys) — only skip when it's explicitly
    # marked disconnected.
    conn_res = await db.execute(
        select(SocialConnection).where(
            SocialConnection.workspace_id == body.workspace_id, SocialConnection.platform == "whatsapp"
        )
    )
    conn = conn_res.scalar_one_or_none()
    if conn is not None and conn.status == ConnectionStatus.DISCONNECTED:
        return

    # Always lands in the real Inbox/CRM for the admin, regardless of
    # whether it's also a campaign-group reply — full visibility is exactly
    # what the admin gets that other participants don't.
    result = await ingest_message(
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
    # A genuinely new inbound message → classify it for the CRM lead pipeline
    # right now, off the response path so the worker isn't held up.
    if result.get("is_new") and result.get("thread_id"):
        background.add_task(
            classify_thread_now, body.workspace_id, result["thread_id"]
        )
    # A campaign participant is keyed by the real phone the admin typed, so try
    # that first; fall back to the raw addressing key for good measure.
    await CampaignGroupService(db, body.workspace_id).relay_reply(
        body.from_pn or body.from_, body.body
    )


@webhook_router.post("/whatsapp-web/webhook/status", status_code=status.HTTP_204_NO_CONTENT)
async def whatsapp_web_status_webhook(
    body: WhatsAppWebStatusWebhook,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_internal_secret),
):
    # GET /whatsapp-web/status still asks the worker directly for the QR/
    # linking UI's real-time truth — this mirrors just the connected/not
    # flag into SocialConnection so the Inbox can gate replies and inbound
    # webhooks without a live worker round trip on every request. Any
    # non-"connected" status (connecting/qr/linking/disconnected/
    # logged_out) is treated as not-safely-connected — the conservative
    # side to fail on while a session is mid-transition.
    await _set_whatsapp_connection_status(db, body.workspace_id, connected=body.status == "connected")
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
# Inbound SMS — STOP-reply handling (see sms_optout_service.py). Providers
# post here directly, not through our own frontend, so auth is a shared
# secret carried in the URL/header rather than verify_internal_secret
# (same pattern as the ElevenLabs webhook) -- configure the matching
# secret in SMS_INBOUND_WEBHOOK_SECRET and point each provider's inbound-
# SMS webhook at the matching URL below.
# --------------------------------------------------------------------------


def _check_sms_webhook_secret(request: Request) -> None:
    supplied = request.headers.get("x-webhook-secret") or request.query_params.get("secret")
    if not settings.SMS_INBOUND_WEBHOOK_SECRET or supplied != settings.SMS_INBOUND_WEBHOOK_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad webhook secret")


async def _handle_inbound_sms(db: AsyncSession, from_phone: str, text: str, to_hint: Optional[str]) -> None:
    keyword = detect_stop_keyword(text)
    if not keyword or not from_phone:
        return
    workspace_id = None
    if to_hint:
        row = (
            await db.execute(select(User.id).where(User.sms_sender_id == to_hint))
        ).scalar_one_or_none()
        if row:
            workspace_id = row
    await record_stop_reply(db, from_phone, keyword, workspace_id=workspace_id)


@webhook_router.post("/webhook/inbound-sms/mobilesasa", status_code=status.HTTP_204_NO_CONTENT)
async def mobilesasa_inbound_sms(request: Request, db: AsyncSession = Depends(get_db)):
    """MobileSasa's exact inbound-webhook payload shape isn't in their
    public docs -- read defensively across the field-name variants a
    provider like this commonly uses, and log the raw body once so it can
    be confirmed/adjusted against a real payload rather than guessed
    twice."""
    _check_sms_webhook_secret(request)
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    from_phone = str(
        body.get("from") or body.get("sender") or body.get("phone") or body.get("msisdn") or ""
    )
    text = str(body.get("message") or body.get("text") or body.get("sms") or "")
    to_hint = body.get("to") or body.get("shortcode") or body.get("senderID")
    if not from_phone or not text:
        logger.warning("mobilesasa inbound-sms webhook: unrecognised payload shape: %r", body)
        return
    await _handle_inbound_sms(db, from_phone, text, str(to_hint) if to_hint else None)


@webhook_router.post("/webhook/inbound-sms/twilio", status_code=status.HTTP_204_NO_CONTENT)
async def twilio_inbound_sms(request: Request, db: AsyncSession = Depends(get_db)):
    """Twilio's inbound-message webhook is a stable, well-documented
    form-encoded POST (From/Body/To) -- unlike MobileSasa's, this shape is
    confirmed, not guessed."""
    _check_sms_webhook_secret(request)
    form = await request.form()
    from_phone = str(form.get("From") or "")
    text = str(form.get("Body") or "")
    to_hint = form.get("To")
    if not from_phone or not text:
        return
    await _handle_inbound_sms(db, from_phone, text, str(to_hint) if to_hint else None)


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
