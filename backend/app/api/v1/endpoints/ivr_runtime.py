"""Drives the IVR menu on REAL inbound calls. Asterisk's dialplan hands a
fresh trunk call to a host-side FastAGI script (asterisk/ivr_agi.py) before
ever dialing the agent; that script calls the endpoints here on every step
(call enters, caller presses a digit, caller times out) and gets back a
small directive telling it exactly what to do next — play this prompt then
wait for a key, or stop asking and go ring the agent / voicemail / the AI
agent / hang up.

Reuses IvrService exactly as-is (the same engine the text simulator and
"place a test call" button already exercise) — only the translation from
its dashboard-oriented directives into AGI-actionable ones, plus rendering
prompt text to audio, is new. See asterisk/README.md for the dialplan side.

Same trust boundary as the PBX event webhook — the AGI script is host-side,
not public, so it reuses PBX_EVENT_WEBHOOK_SECRET rather than a new secret.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_db
from app.models.call import Call, CallDirection, CallState
from app.services.contact_lookup import resolve_contact_name
from app.services.ivr_service import IvrService
from app.services.ivr_tts import render_and_cache

router = APIRouter()


def _check_secret(request: Request) -> None:
    supplied = request.headers.get("x-webhook-secret") or request.query_params.get("secret")
    if not settings.PBX_EVENT_WEBHOOK_SECRET or supplied != settings.PBX_EVENT_WEBHOOK_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad webhook secret")


async def _get_call(db: AsyncSession, call_id: str) -> Call:
    call = (await db.execute(select(Call).where(Call.id == call_id))).scalar_one_or_none()
    if not call:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "call not found")
    return call


async def _to_agi(db: AsyncSession, directive: Dict[str, Any], workspace_id: str, call: Call) -> Dict[str, Any]:
    """Translate one IvrService directive into what the AGI script needs:
    what to say (a media path to play, if anything) and what to do once
    it's done — a fixed vocabulary the dialplan branches on."""
    action = directive.get("action")

    if action in ("ivr_prompt", "ivr_reprompt"):
        flow = await IvrService(db, workspace_id).get_flow(create=False)
        say = await render_and_cache(str(directive.get("prompt") or ""))
        return {
            "then": "menu",
            "call_id": call.id,
            "say": say,
            "timeout": (flow.timeout_seconds if flow else 7),
        }

    if action == "queue":
        # ring_all / ring_agent — the dialplan already knows this workspace's
        # own extension (it resolved it via AstDB before ever calling the
        # AGI), so there's nothing further to tell it here.
        return {"then": "agent"}

    if action == "voicemail":
        return {"then": "voicemail"}

    if action == "message":
        say = await render_and_cache(str(directive.get("text") or ""))
        return {"then": "hangup", "say": say}

    if action == "transfer":
        return {"then": "transfer", "target": directive.get("target") or ""}

    if action == "ai_agent":
        return {"then": "ai_agent"}

    # hangup, or anything unrecognised — never leave a caller hanging in an
    # undefined state.
    return {"then": "hangup"}


@router.post("/enter")
async def ivr_enter(request: Request, db: AsyncSession = Depends(get_db)):
    _check_secret(request)
    body = await request.json()
    workspace_id = str(body.get("workspace_id") or "")
    channel_id = str(body.get("channel_id") or "")
    caller_number = str(body.get("caller_number") or "").strip()
    if not workspace_id or not channel_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "workspace_id and channel_id are required")

    # Idempotent: if the AGI script (or Asterisk) retries this step for the
    # same channel, reuse the row instead of creating a duplicate.
    call = (
        await db.execute(
            select(Call).where(Call.workspace_id == workspace_id, Call.provider_channel_id == channel_id)
        )
    ).scalar_one_or_none()
    if not call:
        name = (await resolve_contact_name(db, workspace_id, caller_number)) if caller_number else None
        call = Call(
            direction=CallDirection.INBOUND,
            state=CallState.QUEUED,
            contact_name=name or "Unknown caller",
            number=caller_number or "unknown",
            reason="Inbound call",
            provider_channel_id=channel_id,
            queued_at=datetime.now(timezone.utc),
            workspace_id=workspace_id,
        )
        db.add(call)
        await db.commit()
        await db.refresh(call)

    directive = await IvrService(db, workspace_id).on_call_enter(call)
    await db.refresh(call)
    return await _to_agi(db, directive, workspace_id, call)


@router.post("/digit")
async def ivr_digit(request: Request, db: AsyncSession = Depends(get_db)):
    _check_secret(request)
    body = await request.json()
    call = await _get_call(db, str(body.get("call_id") or ""))
    digit = str(body.get("digit") or "")
    directive = await IvrService(db, call.workspace_id).on_digit(call, digit)
    await db.refresh(call)
    return await _to_agi(db, directive, call.workspace_id, call)


@router.post("/timeout")
async def ivr_timeout(request: Request, db: AsyncSession = Depends(get_db)):
    _check_secret(request)
    body = await request.json()
    call = await _get_call(db, str(body.get("call_id") or ""))
    directive = await IvrService(db, call.workspace_id).on_timeout(call)
    await db.refresh(call)
    return await _to_agi(db, directive, call.workspace_id, call)
