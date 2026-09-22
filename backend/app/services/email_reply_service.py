"""Reads a sending account's own mailbox via IMAP so replies to bulk emails
show up inside Tolkyn instead of only in the provider's own inbox. Free --
IMAP is a standard protocol included with every provider we already support
(Gmail, Outlook/365, Zoho, Fastmail, most custom hosts), reusing the exact
same account/app-password already saved for sending.

Deliberately not matched to a specific campaign: a reply's Subject line and
threading headers aren't reliable enough across providers to bind it to one
EmailCampaign row. This surfaces "what's arrived in this inbox since we last
checked" for the account, which is what was actually asked for.
"""
from __future__ import annotations

import asyncio
import email
import imaplib
import logging
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt
from app.models.email_account import EmailAccount
from app.models.email_reply import EmailReply

logger = logging.getLogger(__name__)

_POLL_EVERY = timedelta(minutes=5)
_FIRST_POLL_LOOKBACK = timedelta(days=3)
# The stored column is TEXT (no real size limit) -- this caps it generously
# rather than to a true "preview" length, so the full message is actually
# there to view, not just a snippet. The list view still shows a short
# excerpt; this is what backs the "click to read the full email" detail.
_BODY_STORE_LEN = 20_000

# Most providers' IMAP host isn't just "imap." + the SMTP domain (Outlook is
# the clearest example), so map the ones we already offer as presets and
# fall back to a same-domain guess for anything custom.
_IMAP_HOST_BY_SMTP_HOST = {
    "smtp.gmail.com": "imap.gmail.com",
    "smtp.office365.com": "outlook.office365.com",
    "smtp.zoho.com": "imap.zoho.com",
    "smtp.fastmail.com": "imap.fastmail.com",
}


def _imap_host(smtp_host: str) -> str:
    host = (smtp_host or "").strip().lower()
    if host in _IMAP_HOST_BY_SMTP_HOST:
        return _IMAP_HOST_BY_SMTP_HOST[host]
    return host.replace("smtp.", "imap.", 1) if host.startswith("smtp.") else host


def _decode(value: Optional[str]) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def _body_preview(msg: "email.message.Message") -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get_filename():
                try:
                    text = part.get_payload(decode=True).decode(
                        part.get_content_charset() or "utf-8", errors="replace"
                    )
                    return text.strip()[:_BODY_STORE_LEN]
                except Exception:  # noqa: BLE001
                    continue
        return ""
    try:
        text = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
        return text.strip()[:_BODY_STORE_LEN]
    except Exception:  # noqa: BLE001
        return ""


def _poll_account_sync(acc_id: str, host: str, username: str, password: str, since: datetime) -> List[Dict[str, Any]]:
    """Runs in a worker thread (imaplib is blocking, like smtplib)."""
    found: List[Dict[str, Any]] = []
    with imaplib.IMAP4_SSL(host, 993, timeout=20) as m:
        m.login(username, password)
        m.select("INBOX", readonly=True)
        date_str = since.strftime("%d-%b-%Y")
        status_, data = m.search(None, f'(SINCE "{date_str}")')
        if status_ != "OK":
            return found
        for num in data[0].split():
            status_, msg_data = m.fetch(num, "(RFC822)")
            if status_ != "OK" or not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0][1]
            msg = email.message_from_bytes(raw)
            received = None
            date_hdr = msg.get("Date")
            if date_hdr:
                try:
                    received = parsedate_to_datetime(date_hdr)
                    if received.tzinfo is None:
                        received = received.replace(tzinfo=timezone.utc)
                except Exception:  # noqa: BLE001
                    received = None
            if received and received < since:
                continue  # IMAP SINCE is date-only; filter the exact cutoff ourselves
            from_name, from_email = parseaddr(_decode(msg.get("From")))
            if not from_email:
                continue
            found.append({
                "message_id": (msg.get("Message-ID") or "").strip()[:255] or None,
                "from_email": from_email.strip().lower()[:255],
                "from_name": from_name.strip()[:255] or None,
                "subject": _decode(msg.get("Subject"))[:500] or None,
                "body_preview": _body_preview(msg),
                "received_at": received,
            })
    return found


async def _poll_account(db: AsyncSession, acc: EmailAccount) -> int:
    if not acc.smtp_host or not acc.smtp_password_enc:
        return 0
    now = datetime.now(timezone.utc)
    if acc.last_reply_poll_at:
        last = acc.last_reply_poll_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if now - last < _POLL_EVERY:
            return 0
        since = last - timedelta(hours=1)  # small overlap so nothing on a
        # boundary gets missed; message_id dedup below handles re-fetches
    else:
        since = now - _FIRST_POLL_LOOKBACK

    username = acc.smtp_username or acc.from_email
    password = decrypt(acc.smtp_password_enc)
    host = _imap_host(acc.smtp_host)

    try:
        messages = await asyncio.to_thread(_poll_account_sync, acc.id, host, username, password, since)
    except Exception as exc:  # noqa: BLE001 -- one account's IMAP hiccup must never break the sweep
        logger.warning("IMAP poll failed for account %s (%s): %r", acc.id, host, exc)
        return 0

    new_count = 0
    for m in messages:
        if m["message_id"]:
            exists = await db.execute(
                select(EmailReply.id).where(
                    EmailReply.email_account_id == acc.id, EmailReply.message_id == m["message_id"]
                )
            )
            if exists.scalar_one_or_none():
                continue
        db.add(EmailReply(
            workspace_id=acc.workspace_id,
            email_account_id=acc.id,
            message_id=m["message_id"],
            from_email=m["from_email"],
            from_name=m["from_name"],
            subject=m["subject"],
            body_preview=m["body_preview"],
            received_at=m["received_at"],
        ))
        new_count += 1

    await db.execute(update(EmailAccount).where(EmailAccount.id == acc.id).values(last_reply_poll_at=now))
    await db.commit()
    return new_count


async def poll_all_accounts(db: AsyncSession) -> int:
    """One sweep across every account with SMTP credentials saved. Called by
    the background scheduler alongside the other periodic jobs."""
    accounts = (
        await db.execute(select(EmailAccount).where(EmailAccount.smtp_password_enc.isnot(None)))
    ).scalars().all()
    total = 0
    for acc in accounts:
        total += await _poll_account(db, acc)
    return total


class EmailReplyService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.workspace_id = user_id

    async def list(self, limit: int = 200, search: Optional[str] = None) -> List[Dict[str, Any]]:
        q = select(EmailReply).where(EmailReply.workspace_id == self.workspace_id)
        term = (search or "").strip()
        if term:
            like = f"%{term}%"
            q = q.where(
                or_(
                    EmailReply.from_email.ilike(like),
                    EmailReply.from_name.ilike(like),
                    EmailReply.subject.ilike(like),
                    EmailReply.body_preview.ilike(like),
                )
            )
        rows = (
            await self.db.execute(q.order_by(EmailReply.created_at.desc()).limit(limit))
        ).scalars()
        return [
            {
                "id": r.id,
                "from_email": r.from_email,
                "from_name": r.from_name,
                "subject": r.subject,
                "body_preview": r.body_preview,
                "received_at": r.received_at,
                "is_read": r.is_read,
            }
            for r in rows
        ]

    async def mark_read(self, reply_id: str) -> None:
        row = (
            await self.db.execute(
                select(EmailReply).where(EmailReply.id == reply_id, EmailReply.workspace_id == self.workspace_id)
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Reply not found")
        row.is_read = True
        await self.db.commit()
