"""ElevenLabs Conversational AI (ElevenAgents) — service-to-service, no user
session. Two things live here:

1. The conversation-initiation webhook: ElevenLabs POSTs here right before
   an inbound SIP call starts talking, so the agent can greet the caller by
   name and know which workspace it's answering for, instead of starting
   cold. Configure this URL in the agent's Security tab ("Fetch initiation
   client data from a webhook") with a custom header carrying
   ELEVENLABS_WEBHOOK_SECRET.

2. "Tool" endpoints — plain REST actions the agent can be given as webhook
   tools in its own config, so it can actually do things on this platform
   (resolve/save a caller's name, check business hours) instead of just
   talking. Point each tool at the matching URL below with the same secret
   header; ElevenLabs' own dashboard is where you wire a tool call's JSON
   response back into the conversation (see their Tools docs).

Everything here is inert until ELEVENLABS_WEBHOOK_SECRET is set — every
handler 401s without it, same as the PBX event webhook.

Verified against ElevenLabs' own SIP trunking + personalization docs
(pasted into this project's chat history), not guessed:
- request shape: caller_id, called_number, agent_id, call_sid,
  conversation_id, and for SIP calls call_id / sip_headers
- response shape: {"type": "conversation_initiation_client_data",
  "dynamic_variables": {...}}
- a `secret__` prefixed dynamic variable is never sent to the LLM/spoken —
  exactly what we want for internal ids like workspace_id
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_db
from app.models.telephony import TelephonyConfig
from app.models.user import User
from app.services.contact_lookup import resolve_contact_name, save_known_caller
from app.services.ivr_service import IvrService

logger = logging.getLogger(__name__)

router = APIRouter()


def _check_secret(request: Request) -> None:
    supplied = request.headers.get("x-webhook-secret") or request.query_params.get("secret")
    if not settings.ELEVENLABS_WEBHOOK_SECRET or supplied != settings.ELEVENLABS_WEBHOOK_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad webhook secret")


def _last9(s: str) -> str:
    digits = re.sub(r"\D", "", s or "")
    return digits[-9:] if len(digits) >= 9 else digits


async def _resolve_workspace(
    db: AsyncSession, called_number: str, sip_headers: Optional[Dict[str, Any]]
) -> Optional[str]:
    """We control both sides of the SIP leg to ElevenLabs, so the fast path
    is a custom X-Workspace-Id header on our own outbound INVITE — inbound
    custom X- headers are surfaced back verbatim in sip_headers per their
    docs. Falls back to matching called_number against the same DID pool
    used everywhere else, in case that header isn't present for some call
    path (e.g. a test call placed straight from the ElevenLabs dashboard)."""
    if sip_headers:
        for k, v in sip_headers.items():
            if str(k).lower().replace("_", "-") == "x-workspace-id" and v:
                return str(v)

    did9 = _last9(called_number)
    if not did9:
        return None
    rows = (
        await db.execute(
            select(TelephonyConfig.workspace_id, TelephonyConfig.outbound_caller_id).where(
                TelephonyConfig.provider == "asterisk",
                TelephonyConfig.outbound_caller_id.isnot(None),
            )
        )
    ).all()
    for ws, did in rows:
        if _last9(did) == did9:
            return ws
    return None


@router.post("/conversation-init")
async def conversation_init(request: Request, db: AsyncSession = Depends(get_db)):
    _check_secret(request)
    body: Dict[str, Any] = await request.json()
    caller_id = str(body.get("caller_id") or "")
    called_number = str(body.get("called_number") or "")
    sip_headers = body.get("sip_headers") if isinstance(body.get("sip_headers"), dict) else None
    # Temporary: workspace resolution has been inconsistent across real
    # calls (business_name sometimes falls back to "our team" even on real
    # inbound calls) -- log exactly what ElevenLabs actually sends so we can
    # see whether called_number is the real dialled DID or our static SIP
    # trunk identity, instead of guessing further.
    logger.warning(
        "conversation-init: caller_id=%r called_number=%r sip_headers=%r full_body=%r",
        caller_id, called_number, sip_headers, body,
    )

    workspace_id = await _resolve_workspace(db, called_number, sip_headers)
    logger.warning("conversation-init: resolved workspace_id=%r", workspace_id)
    # business_name is a REQUIRED variable in the agent's first message --
    # always set it to something, even when the workspace can't be resolved
    # (an unmapped test call, a misdial), or the agent errors out before it
    # even starts talking.
    # business_info is also referenced in the prompt, so it needs the same
    # always-present treatment as business_name -- an empty string is a safe,
    # valid default (the prompt just reads as having nothing extra to add).
    # Named "business_info", not "knowledge_base" -- the latter collides with
    # ElevenLabs' own built-in per-agent Knowledge Base/RAG feature name, and
    # in testing a dynamic variable with that exact name was never picked up
    # by the agent even though the payload genuinely carried it (confirmed via
    # a direct webhook call) -- while an ordinary name works fine.
    dynamic_vars: Dict[str, Any] = {"caller_number": caller_id, "business_name": "our team", "business_info": ""}
    if workspace_id:
        # secret__ — never sent to the LLM or spoken; just carried through
        # so a later tool call (resolve-caller, save-caller-name, ...) knows
        # which workspace's data to touch.
        dynamic_vars["secret__workspace_id"] = workspace_id
        name = await resolve_contact_name(db, workspace_id, caller_id) if caller_id else None
        if name:
            dynamic_vars["caller_name"] = name

        flow = await IvrService(db, workspace_id).get_flow(create=False)
        business_name = (flow.business_name if flow else None) or ""
        if not business_name:
            user = (
                await db.execute(select(User.name).where(User.id == workspace_id))
            ).scalar_one_or_none()
            business_name = user or ""
        if business_name:
            dynamic_vars["business_name"] = business_name

        # No documented size limit from ElevenLabs for a dynamic variable's
        # value -- cap it ourselves so one workspace's long-winded notes
        # can't blow out the agent's response latency or hit some
        # undocumented ceiling on a live call.
        kb = ((flow.knowledge_base if flow else None) or "").strip()
        if kb:
            dynamic_vars["business_info"] = kb[:4000]

    return {"type": "conversation_initiation_client_data", "dynamic_variables": dynamic_vars}


@router.post("/tools/{workspace_id}/resolve-caller")
async def tool_resolve_caller(workspace_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Tool: given a phone number, who is this? Same lookup the human Call
    Center UI uses (KnownCaller, then CRM / phone book / leads)."""
    _check_secret(request)
    body = await request.json()
    number = str(body.get("number") or "")
    name = await resolve_contact_name(db, workspace_id, number)
    return {"name": name or "", "known": bool(name)}


@router.post("/tools/{workspace_id}/save-caller-name")
async def tool_save_caller_name(workspace_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Tool: the agent asked the caller their name — remember it against
    this number, same as the human "Save name" action mid-call."""
    _check_secret(request)
    body = await request.json()
    number = str(body.get("number") or "")
    name = str(body.get("name") or "")
    saved = await save_known_caller(db, workspace_id, number, name)
    return {"saved": saved}


@router.get("/tools/{workspace_id}/business-info")
async def tool_business_info(workspace_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Tool: the workspace's own business facts (hours, services, policies —
    whatever's saved in Super Admin's Knowledge base field), fetched live
    when the caller actually asks about the business — instead of relying
    on the agent noticing a paragraph handed to it as dynamic-variable
    context, which proved unreliable in testing regardless of prompt
    wording. Point this agent's Tools tab at this URL with workspace_id set
    to {{secret__workspace_id}}."""
    _check_secret(request)
    flow = await IvrService(db, workspace_id).get_flow(create=False)
    info = ((flow.knowledge_base if flow else None) or "").strip()
    return {"info": info}


@router.get("/tools/{workspace_id}/business-status")
async def tool_business_status(workspace_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Tool: is this workspace open right now, per its own IVR business
    hours? Lets the agent say "we're closed, I'll take a message" instead
    of guessing."""
    _check_secret(request)
    svc = IvrService(db, workspace_id)
    flow = await svc.get_flow(create=False)
    if not flow or not flow.hours_enabled:
        return {"open": True, "message": ""}
    is_open = await svc.is_open_now(flow)
    return {"open": is_open, "message": "" if is_open else flow.after_hours_message}
