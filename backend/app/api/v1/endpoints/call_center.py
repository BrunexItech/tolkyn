from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import Actor, get_actor, get_workspace_id
from app.core.config import settings
from app.db import get_db
from app.models.team_member import TeamRole
from app.models.telephony import TelephonyConfig
from app.schemas.call_center import (
    AgentSipUpdate,
    CallOverview,
    CallPoll,
    DialRequest,
    FlagsRequest,
    HangupRequest,
    IvrFlowPayload,
    IvrFlowUpdate,
    IvrSimulateRequest,
    IvrSimulateResult,
    PresenceRequest,
    SoftphoneConfig,
    SoftphoneEvent,
)
from app.services.call_center_service import CallCenterService
from app.services.ivr_service import IvrService

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


# ---- IVR / inbound call flow --------------------------------------------
@router.get("/ivr", response_model=IvrFlowPayload)
async def get_ivr(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return IvrFlowPayload(**await IvrService(db, user_id).as_dict())


@router.put("/ivr", response_model=IvrFlowPayload)
async def update_ivr(
    body: IvrFlowUpdate,
    actor: Actor = Depends(get_actor),
    db: AsyncSession = Depends(get_db),
):
    if actor.role != TeamRole.OWNER and not actor.has("engage"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the workspace owner can edit the call flow.")
    patch = body.model_dump(exclude_unset=True)
    return IvrFlowPayload(**await IvrService(db, actor.workspace_id).update(patch))


@router.post("/ivr/test", response_model=IvrSimulateResult)
async def test_ivr(
    body: IvrSimulateRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return IvrSimulateResult(**await IvrService(db, user_id).simulate(body.digits))


@router.post("/ivr/simulate-call", response_model=CallOverview)
async def simulate_ivr_call(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Drop a fresh inbound call straight into the live IVR — for end-to-end
    testing without a real trunk."""
    svc = _svc(db, user_id)
    await svc.simulate_inbound_ivr()
    return await svc.overview()


@router.post("/calls/{call_id}/ivr-press", response_model=CallOverview)
async def ivr_press(
    call_id: str,
    body: IvrSimulateRequest,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    """Send a keypress to a call currently in the IVR menu."""
    svc = _svc(db, user_id)
    digit = (body.digits or [""])[0]
    await svc.ivr_press(call_id, digit)
    return await svc.overview()


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
