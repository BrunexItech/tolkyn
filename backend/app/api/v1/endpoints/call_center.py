from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import Actor, get_actor, get_workspace_id
from app.core.config import settings
from app.core.crypto import decrypt
from app.db import get_db
from app.models.call import CallAgent
from app.models.team_member import TeamRole
from app.models.telephony import TelephonyConfig
from app.schemas.call_center import (
    AgentSipUpdate,
    CallOverview,
    CallPoll,
    DialRequest,
    FlagsRequest,
    HangupRequest,
    PresenceRequest,
    SaveCallerNameRequest,
    SoftphoneConfig,
    SoftphoneEvent,
)
from app.services.call_center_service import CallCenterService

router = APIRouter()
# PBX -> backend call events (per-workspace URL + shared secret). Not
# plan-gated — see api/v1/__init__.py.
webhook_router = APIRouter()


def _svc(db: AsyncSession, user_id: str) -> CallCenterService:
    return CallCenterService(db, user_id)


@router.get("/overview", response_model=CallOverview)
async def overview(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await _svc(db, user_id).overview()


@router.get("/poll", response_model=CallPoll)
async def poll(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return await _svc(db, user_id).poll()


@router.post("/dial", response_model=CallOverview)
async def dial(
    body: DialRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.dial(body.name, body.number)
    return await svc.overview()


@router.post("/calls/{call_id}/answer", response_model=CallOverview)
async def answer(
    call_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.answer(call_id)
    return await svc.overview()


@router.post("/calls/{call_id}/hangup", response_model=CallOverview)
async def hangup(
    call_id: str,
    body: HangupRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.hangup(call_id, body.outcome)
    return await svc.overview()


@router.post("/calls/{call_id}/name", response_model=CallOverview)
async def save_caller_name(
    call_id: str,
    body: SaveCallerNameRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.save_caller_name(call_id, body.name)
    return await svc.overview()


@router.post("/calls/{call_id}/flags", response_model=CallOverview)
async def flags(
    call_id: str,
    body: FlagsRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.set_flags(call_id, body.muted, body.on_hold)
    return await svc.overview()


@router.post("/calls/{call_id}/dismiss", response_model=CallOverview)
async def dismiss(
    call_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.dismiss(call_id)
    return await svc.overview()


@router.post("/presence", response_model=CallOverview)
async def presence(
    body: PresenceRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.set_presence(body.status)
    return await svc.overview()


@router.post("/simulate-inbound", response_model=CallOverview)
async def simulate_inbound(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    svc = _svc(db, user_id)
    await svc.simulate_inbound()
    return await svc.overview()


# ---- SIP trunk / softphone -------------------------------------------------
@router.get("/softphone", response_model=SoftphoneConfig)
async def softphone(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return SoftphoneConfig(**await _svc(db, user_id).softphone_config())


@router.post("/softphone/event", response_model=CallOverview)
async def softphone_event(
    body: SoftphoneEvent,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """The browser softphone reports its own SIP lifecycle (inbound ring,
    answered, ended). Keeps the Call Center in sync while the agent's tab is
    open even if the server-side AMI bridge is down."""
    svc = _svc(db, user_id)
    await svc.report_softphone(body.kind, body.number, body.name)
    return await svc.overview()


@router.patch("/agents/{agent_id}/sip", response_model=CallOverview)
async def set_agent_sip(
    agent_id: str,
    body: AgentSipUpdate,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    if actor.role != TeamRole.OWNER and not actor.has("engage"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the workspace owner can set agent lines.")
    svc = _svc(db, actor.workspace_id)
    await svc.set_agent_sip(agent_id, body.sip_extension, body.sip_password)
    return await svc.overview()


# IVR / inbound call flow: configuring and testing it now lives entirely in
# Super Admin -> Telephony -> Call flow (see endpoints/admin.py) — a Tolkyn
# operator builds it from the client's requirements. The runtime this
# builds still runs every real call (CallCenterService.handle_pbx_event ->
# IvrService), and this workspace router still surfaces read-only "who's in
# the menu right now" via overview()/poll()'s ivrCalls — only the
# editing/testing HTTP surface moved.


# ---- PBX routing table (host sync script -> backend) --------------------
def _check_pbx_secret(request: Request) -> None:
    supplied = request.headers.get("x-webhook-secret") or request.query_params.get("secret")
    if not settings.PBX_EVENT_WEBHOOK_SECRET or supplied != settings.PBX_EVENT_WEBHOOK_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad webhook secret")


@webhook_router.get("/pbx-routing")
async def pbx_routing(request: Request, db: AsyncSession = Depends(get_db)):
    """Every DID -> SIP extension -> workspace line currently live on the
    shared Asterisk PBX. The host-side sync script (asterisk/sync_workspaces.py)
    polls this to keep PJSIP endpoints + the AstDB routing table in sync with
    what super admin has configured — so adding a client is 'assign a DID and
    an extension', never a manual dialplan edit.

    Global secret only (not a per-workspace one): this spans every tenant, so
    only the PBX host itself should ever be able to call it — it returns
    every agent's SIP password in the clear."""
    _check_pbx_secret(request)
    rows = (
        await db.execute(
            select(TelephonyConfig, CallAgent)
            .join(CallAgent, CallAgent.workspace_id == TelephonyConfig.workspace_id)
            .where(
                TelephonyConfig.provider == "asterisk",
                TelephonyConfig.is_active.is_(True),
                TelephonyConfig.outbound_caller_id.isnot(None),
                CallAgent.is_self.is_(True),
            )
        )
    ).all()
    lines = []
    for cfg, agent in rows:
        if not (agent.sip_extension and agent.sip_password_enc):
            continue
        try:
            password = decrypt(agent.sip_password_enc)
        except Exception:  # noqa: BLE001 - a bad/legacy ciphertext shouldn't break every other line
            continue
        lines.append({
            "workspace_id": cfg.workspace_id,
            "did": cfg.outbound_caller_id,
            "extension": agent.sip_extension,
            "password": password,
            "record_calls": bool(cfg.record_calls),
        })
    return {"lines": lines}


# ---- PBX event webhook (on webhook_router — not plan-gated) --------------
@webhook_router.post("/webhook/{workspace_id}/event", status_code=status.HTTP_204_NO_CONTENT)
async def pbx_event(
    workspace_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # "_default" => the single workspace whose telephony provider is the
    # self-hosted Asterisk (the POC has exactly one). Saves the host bridge
    # from having to know a workspace UUID.
    cfg = None
    if workspace_id == "_default":
        cfg = (
            await db.execute(
                select(TelephonyConfig).where(
                    TelephonyConfig.provider == "asterisk",
                    TelephonyConfig.is_active.is_(True),
                )
            )
        ).scalars().first()
    else:
        cfg = (
            await db.execute(select(TelephonyConfig).where(TelephonyConfig.workspace_id == workspace_id))
        ).scalar_one_or_none()
    if not cfg:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    supplied = request.headers.get("x-webhook-secret") or request.query_params.get("secret")
    allowed = {s for s in (cfg.webhook_secret, settings.PBX_EVENT_WEBHOOK_SECRET) if s}
    if not allowed or supplied not in allowed:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad webhook secret")
    payload = await request.json()
    await CallCenterService(db, cfg.workspace_id).handle_pbx_event(payload)
