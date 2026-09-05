"""Outbound SMS / WhatsApp delivery.

SMS routes through Mobile Sasa when ``MOBILESASA_TOKEN`` is set, else Twilio when
its keys are set, else a *simulated* send (logged, marked ``simulated`` in the
result) so the product is fully usable before real credentials are wired.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import dataclass
from typing import List, Optional

import httpx

from app.core.config import settings

_E164 = re.compile(r"^\+[1-9]\d{6,14}$")


def normalize_phone(raw: str, default_cc: str = "") -> Optional[str]:
    """Best-effort E.164 normalisation. Returns None when clearly not a phone."""
    if not raw:
        return None
    cc = default_cc or settings.DEFAULT_COUNTRY_CODE or ""
    s = re.sub(r"[^\d+]", "", str(raw))
    if s.startswith("00"):
        s = "+" + s[2:]
    if not s.startswith("+"):
        if s.startswith(cc.lstrip("+")):
            s = "+" + s
        elif cc:
            s = cc + s.lstrip("0")
    return s if _E164.match(s) else None


def _mobilesasa_phone(e164: str) -> str:
    """Mobile Sasa wants the local Kenyan format (0712345678)."""
    digits = re.sub(r"[^\d]", "", e164 or "")
    if digits.startswith("254") and len(digits) == 12:
        return "0" + digits[3:]
    if digits.startswith("0"):
        return digits
    return e164


@dataclass
class SendResult:
    phone: str
    ok: bool
    provider: str
    id: Optional[str] = None
    error: Optional[str] = None
    simulated: bool = False


def mobilesasa_ready() -> bool:
    return bool(settings.MOBILESASA_TOKEN and settings.MOBILESASA_SENDER_ID)


def twilio_ready() -> bool:
    return bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_SMS_FROM)


def sms_ready() -> bool:
    return mobilesasa_ready() or twilio_ready()


def sms_provider_name() -> str:
    if mobilesasa_ready():
        return "mobilesasa"
    if twilio_ready():
        return "twilio"
    return "simulated"


def whatsapp_ready() -> bool:
    return bool(settings.WHATSAPP_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)


# --------------------------------------------------------------------- SMS
async def _send_sms_mobilesasa(to: str, body: str) -> SendResult:
    url = f"{settings.MOBILESASA_BASE_URL.rstrip('/')}/v1/send/message"
    headers = {
        "Authorization": f"Bearer {settings.MOBILESASA_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "senderID": settings.MOBILESASA_SENDER_ID,
        "phone": _mobilesasa_phone(to),
        "message": body,
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(url, json=payload, headers=headers)
    except Exception as exc:  # pragma: no cover - network
        return SendResult(to, False, "mobilesasa", error=str(exc))

    data: dict = {}
    try:
        data = r.json() if r.text else {}
    except Exception:
        data = {}

    # Mobile Sasa returns a JSON body with a boolean "status" and a
    # "responseCode" ("0200"/"200" on success); ids appear as messageId/bulkId.
    code = str(data.get("responseCode") or "").lstrip("0")
    if r.status_code >= 300 or data.get("status") is False:
        ok = False
    elif data.get("status") is True or code in ("200", ""):
        ok = True
    else:
        ok = False
    msg_id = data.get("messageId") or data.get("bulkId") or data.get("id")
    if ok:
        return SendResult(to, True, "mobilesasa", id=str(msg_id) if msg_id else None)
    err = str(data.get("message") or data.get("error") or data or f"HTTP {r.status_code}")[:240]
    return SendResult(to, False, "mobilesasa", error=err)


async def _send_sms_twilio(to: str, body: str) -> SendResult:
    sid = settings.TWILIO_ACCOUNT_SID
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    data = {"To": to, "Body": body}
    frm = settings.TWILIO_SMS_FROM or ""
    if frm.startswith("MG"):
        data["MessagingServiceSid"] = frm
    else:
        data["From"] = frm
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, data=data, auth=(sid, settings.TWILIO_AUTH_TOKEN))
        if r.status_code >= 300:
            return SendResult(to, False, "twilio", error=_extract_error(r))
        return SendResult(to, True, "twilio", id=r.json().get("sid"))
    except Exception as exc:  # pragma: no cover - network
        return SendResult(to, False, "twilio", error=str(exc))


async def send_sms(to: str, body: str) -> SendResult:
    if mobilesasa_ready():
        return await _send_sms_mobilesasa(to, body)
    if twilio_ready():
        return await _send_sms_twilio(to, body)
    return SendResult(to, True, "simulated", id=f"sim_{uuid.uuid4().hex[:12]}", simulated=True)


# ---------------------------------------------------------------- WhatsApp
async def send_whatsapp(to: str, body: str, workspace_id: Optional[str] = None) -> SendResult:
    # Official Cloud API first (zero ban risk) — falls back to this
    # workspace's self-hosted session (real ban risk, see
    # app.services.whatsapp_web_service) only when the Cloud API isn't
    # configured, and only ever simulated as a last resort.
    if not whatsapp_ready():
        if workspace_id:
            return await _send_whatsapp_self_hosted(workspace_id, to, body)
        return SendResult(to, True, "simulated", id=f"sim_{uuid.uuid4().hex[:12]}", simulated=True)
    pnid = settings.WHATSAPP_PHONE_NUMBER_ID
    url = f"https://graph.facebook.com/v21.0/{pnid}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "text",
        "text": {"body": body},
    }
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code >= 300:
            return SendResult(to, False, "whatsapp_cloud", error=_extract_error(r))
        msgs = r.json().get("messages") or [{}]
        return SendResult(to, True, "whatsapp_cloud", id=msgs[0].get("id"))
    except Exception as exc:  # pragma: no cover - network
        return SendResult(to, False, "whatsapp_cloud", error=str(exc))


async def _send_whatsapp_self_hosted(workspace_id: str, to: str, body: str) -> SendResult:
    """Each recipient gets their own private 1:1 message — not a shared
    group or thread — so nobody a campaign is sent to ever sees another
    recipient, by construction rather than by any masking logic. Only the
    workspace's own Inbox/CRM sees every reply, same as any other channel."""
    from app.services.whatsapp_web_service import WhatsAppWebError, send_message

    try:
        result = await send_message(workspace_id, to, body)
        return SendResult(to, True, "whatsapp_web", id=result.get("id"))
    except WhatsAppWebError as exc:
        return SendResult(to, False, "whatsapp_web", error=exc.message)


def _extract_error(r: httpx.Response) -> str:
    try:
        j = r.json()
        return str(j.get("message") or j.get("error", {}).get("message") or j)[:240]
    except Exception:
        return f"HTTP {r.status_code}"


async def send_many(
    channel: str, to_list: List[str], body: str, *, concurrency: int = 4, workspace_id: Optional[str] = None
) -> List[SendResult]:
    if channel == "whatsapp":
        fn = lambda phone: send_whatsapp(phone, body, workspace_id=workspace_id)  # noqa: E731
        if not whatsapp_ready() and workspace_id:
            # Routing through the self-hosted session — its anti-ban pacing
            # (whatsapp-worker/src/antiban.js) assumes sends arrive one at a
            # time; blasting it with concurrent requests would race past
            # that pacing instead of respecting it.
            concurrency = 1
    else:
        fn = lambda phone: send_sms(phone, body)  # noqa: E731

    sem = asyncio.Semaphore(max(1, concurrency))

    async def one(phone: str) -> SendResult:
        async with sem:
            return await fn(phone)

    return list(await asyncio.gather(*(one(p) for p in to_list)))
