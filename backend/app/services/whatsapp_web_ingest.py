"""Turns webhooks from the whatsapp-worker into the same InboxThread/
InboxMessage rows every other channel uses — so the existing Inbox UI, the
auto-classification sweep (SocialLeadService, see app.services.scheduler),
and CRM lead capture all pick this up for free, with zero new code on that
side. Runs with a raw workspace_id straight from the (shared-secret
authenticated) webhook payload — there's no logged-in actor here, this is a
service-to-service call, not a user request."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inbox import InboxMessage, InboxThread, ThreadKind, ThreadStatus


async def _get_or_create_thread(
    db: AsyncSession,
    workspace_id: str,
    phone: str,
    display_name: Optional[str],
    at: datetime,
    *,
    jid: Optional[str] = None,
    real_phone: Optional[str] = None,
) -> InboxThread:
    res = await db.execute(
        select(InboxThread).where(
            InboxThread.workspace_id == workspace_id,
            InboxThread.source == "whatsapp_web",
            InboxThread.external_id == phone,
        )
    )
    thread = res.scalar_one_or_none()
    # The reply path sends to ref["wa_jid"] — the exact identity WhatsApp used
    # (may be a "<n>@lid", which is NOT a phone number). Without it, a reply
    # rebuilt from digits goes to the wrong identity and is silently dropped.
    send_jid = jid or (f"{phone.lstrip('+')}@s.whatsapp.net" if phone else None)
    if thread is None:
        thread = InboxThread(
            platform="whatsapp",
            kind=ThreadKind.DM,
            status=ThreadStatus.OPEN,
            author_name=display_name or real_phone or phone,
            author_handle=real_phone or phone,
            context="WhatsApp conversation",
            source="whatsapp_web",
            external_id=phone,
            ref={"wa_phone": real_phone or phone, "wa_jid": send_jid},
            unread=0,
            last_message_at=at,
            workspace_id=workspace_id,
        )
        db.add(thread)
        await db.flush()  # need thread.id for message FKs
    else:
        # Backfill / repair the addressing identity on threads created before
        # this field existed, or if WhatsApp switched how it addresses them.
        ref = dict(thread.ref or {})
        if send_jid and ref.get("wa_jid") != send_jid:
            ref["wa_jid"] = send_jid
        if real_phone:
            # A genuine phone from WhatsApp always beats a LID-derived one for
            # display and dedup-hints — trust the freshest disclosure.
            ref["wa_phone"] = real_phone
            thread.author_handle = real_phone
        if ref != (thread.ref or {}):
            thread.ref = ref
    return thread


async def ingest_message(
    db: AsyncSession,
    workspace_id: str,
    *,
    external_id: str,
    from_phone: str,
    from_name: Optional[str],
    body: str,
    at_ms: int,
    from_jid: Optional[str] = None,
    from_pn: Optional[str] = None,
) -> Dict[str, Any]:
    at = datetime.fromtimestamp(at_ms / 1000, tz=timezone.utc)
    display_name = from_name or from_pn or from_phone

    thread = await _get_or_create_thread(
        db, workspace_id, from_phone, from_name, at, jid=from_jid, real_phone=from_pn
    )
    # A stranger's WhatsApp display name can change or resolve better over
    # time (their pushName isn't always sent) — keep it current, same
    # "repair on resync" convention used for the other channels.
    if from_name and from_name != thread.author_name:
        thread.author_name = from_name
    thread.unread = 1
    thread.last_message_at = at
    if thread.status == ThreadStatus.DONE:
        thread.status = ThreadStatus.OPEN

    is_new = not await _already_recorded(db, thread.id, external_id)
    if is_new:
        db.add(
            InboxMessage(
                thread_id=thread.id, direction="in", author_name=display_name,
                body=body, external_id=external_id, at=at,
            )
        )
    await db.commit()

    # Return the thread id + whether this was genuinely new, so the caller can
    # kick off immediate lead classification without another lookup.
    return {"thread_id": thread.id, "is_new": is_new}


async def ingest_history_batch(db: AsyncSession, workspace_id: str, messages: List[Dict[str, Any]]) -> None:
    """One-time backfill of whatever chat history WhatsApp handed over right
    after linking. Doesn't mark threads unread or bump last_message_at past
    what a live message already set — this is filling in the past, not
    reporting something new just arrived."""
    by_contact: Dict[str, List[Dict[str, Any]]] = {}
    for m in messages:
        by_contact.setdefault(m["contact"], []).append(m)

    for phone, msgs in by_contact.items():
        newest = max(msgs, key=lambda m: m["at"])
        at = datetime.fromtimestamp(newest["at"] / 1000, tz=timezone.utc)
        name = next((m.get("contact_name") for m in msgs if m.get("contact_name")), None)
        jid = next((m.get("contact_jid") for m in msgs if m.get("contact_jid")), None)
        real_phone = next((m.get("contact_pn") for m in msgs if m.get("contact_pn")), None)

        thread = await _get_or_create_thread(
            db, workspace_id, phone, name, at, jid=jid, real_phone=real_phone
        )
        if thread.last_message_at is None or at > thread.last_message_at:
            thread.last_message_at = at

        for m in msgs:
            if await _already_recorded(db, thread.id, m["external_id"]):
                continue
            db.add(
                InboxMessage(
                    thread_id=thread.id,
                    direction=m["direction"],
                    author_name="You" if m["direction"] == "out" else (name or phone),
                    body=m["body"],
                    external_id=m["external_id"],
                    at=datetime.fromtimestamp(m["at"] / 1000, tz=timezone.utc),
                )
            )
    await db.commit()


async def _already_recorded(db: AsyncSession, thread_id: str, external_id: str) -> bool:
    res = await db.execute(
        select(InboxMessage.id).where(
            InboxMessage.thread_id == thread_id, InboxMessage.external_id == external_id
        )
    )
    return res.scalar_one_or_none() is not None


async def classify_thread_now(workspace_id: str, thread_id: str) -> None:
    """Fire-and-forget: the instant a real message lands, run it through the
    lead classifier so a fresh SocialLead shows up in the CRM pipeline right
    away instead of on the next 4-minute sweep. Opens its own session because
    the request that triggered it has already returned. Never raises."""
    from app.db.base import AsyncSessionLocal
    from app.services.social_lead_service import SocialLeadService

    try:
        async with AsyncSessionLocal() as db:
            await SocialLeadService(db, workspace_id).classify_thread_now(thread_id)
    except Exception as exc:  # noqa: BLE001 — background best-effort
        print(f"[whatsapp-web] immediate lead classify failed: {exc}")
