"""Internal endpoints for the host's ami-bridge.py -- the only process with
a live AMI connection to Asterisk, so it's the one that actually originates
Voice Broadcast calls. This is a poll-and-claim queue, same shape as every
other "ask until it's ready" sweep in this app, just pulled from the host
side instead of the scheduler: ami-bridge.py asks for pending jobs, fetches
each one's rendered audio onto the Asterisk host, sends the AMI Originate,
then reports back whether that succeeded.

Secured the same way as ivr_runtime.py (same shared secret, same header) --
these routes are never meant to be reachable by a tenant's own browser.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_db
from app.models.voice_call_job import VoiceCallJob, VoiceCallJobStatus

router = APIRouter()


def _check_secret(request: Request) -> None:
    supplied = request.headers.get("x-webhook-secret") or request.query_params.get("secret")
    if not settings.PBX_EVENT_WEBHOOK_SECRET or supplied != settings.PBX_EVENT_WEBHOOK_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad webhook secret")


class PendingJob(BaseModel):
    id: str
    phone: str
    caller_id: Optional[str] = None
    audio_rel_path: str


class ResultBody(BaseModel):
    status: str  # "dispatched" | "failed"
    error: Optional[str] = None


@router.get("/pending", response_model=List[PendingJob])
async def pending_jobs(
    request: Request,
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    _check_secret(request)
    rows = (
        await db.execute(
            select(VoiceCallJob)
            .where(VoiceCallJob.status == VoiceCallJobStatus.QUEUED)
            .order_by(VoiceCallJob.created_at.asc())
            .limit(limit)
        )
    ).scalars().all()
    # Claim immediately -- ami-bridge.py polls one at a time, but this stops
    # the same row being handed out twice if a poll overlaps a slow one.
    for job in rows:
        job.status = VoiceCallJobStatus.DISPATCHED
        job.dispatched_at = datetime.now(timezone.utc)
    if rows:
        await db.commit()
    return [
        PendingJob(id=j.id, phone=j.phone, caller_id=j.caller_id, audio_rel_path=j.audio_rel_path)
        for j in rows
    ]


@router.post("/{job_id}/result")
async def report_result(job_id: str, body: ResultBody, request: Request, db: AsyncSession = Depends(get_db)):
    _check_secret(request)
    job = (await db.execute(select(VoiceCallJob).where(VoiceCallJob.id == job_id))).scalar_one_or_none()
    if not job:
        return {"ok": True}  # nothing to do — never make the host script retry forever on a stale id
    if body.status == "failed":
        job.status = VoiceCallJobStatus.FAILED
        job.error = (body.error or "")[:500]
    await db.commit()
    return {"ok": True}
