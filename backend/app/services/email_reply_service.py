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
import mimetypes
import uuid
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt
from app.models.email_account import EmailAccount
from app.models.email_reply import EmailReply
from app.services.email_account_service import EmailAccountService
from app.services.email_sender import send_email

logger = logging.getLogger(__name__)

_POLL_EVERY = timedelta(minutes=5)
_FIRST_POLL_LOOKBACK = timedelta(days=3)
# TEXT columns have no real size limit -- this caps generously rather than
# to a true "preview" length, so the full message is actually there to
# view, not just a snippet.
_BODY_STORE_LEN = 20_000

_MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "email-attachments"

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


def _save_image(part: "email.message.Message") -> Optional[Dict[str, Any]]:
    """Writes one image part to disk, returns {filename, url, content_type,
    size, content_id} or None on failure. content_id (without <>) is used to
    rewrite matching cid: references in the HTML body."""
    try:
        payload = part.get_payload(decode=True)
        if not payload:
            return None
        ctype = part.get_content_type()
        ext = mimetypes.guess_extension(ctype) or ".bin"
        name = f"{uuid.uuid4().hex}{ext}"
        _MEDIA_DIR.mkdir(parents=True, exist_ok=True)
        (_MEDIA_DIR / name).write_bytes(payload)
        cid = (part.get("Content-ID") or "").strip().strip("<>") or None
        base = (settings.BACKEND_PUBLIC_URL or "").rstrip("/")
        return {
            "filename": part.get_filename() or name,
            "url": f"{base}/media/email-attachments/{name}",
            "content_type": ctype,
            "size": len(payload),
            "content_id": cid,
        }
    except Exception as exc:  # noqa: BLE001 -- one bad part shouldn't drop the whole message
        logger.warning("failed to save email image part: %r", exc)
        return None


def _extract_content(msg: "email.message.Message") -> Dict[str, Any]:
    """Pulls plain text, HTML (with cid: images rewritten to real URLs), and
    a flat attachments list out of a parsed email.message.Message."""
    plain = ""
    html = ""
    images: List[Dict[str, Any]] = []

    parts = msg.walk() if msg.is_multipart() else [msg]
    for part in parts:
        ctype = part.get_content_type()
        disposition = (part.get("Content-Disposition") or "").lower()
        if ctype == "text/plain" and "attachment" not in disposition and not plain:
            try:
                plain = part.get_payload(decode=True).decode(
                    part.get_content_charset() or "utf-8", errors="replace"
                ).strip()[:_BODY_STORE_LEN]
            except Exception:  # noqa: BLE001
                pass
        elif ctype == "text/html" and "attachment" not in disposition and not html:
            try:
                html = part.get_payload(decode=True).decode(
                    part.get_content_charset() or "utf-8", errors="replace"
                )[:_BODY_STORE_LEN]
            except Exception:  # noqa: BLE001
                pass
        elif ctype.startswith("image/"):
            saved = _save_image(part)
            if saved:
                images.append(saved)

    for img in images:
        if img["content_id"]:
            html = html.replace(f"cid:{img['content_id']}", img["url"])

    return {
        "body_preview": plain,
        "body_html": html or None,
        "attachments": [
            {"filename": i["filename"], "url": i["url"], "content_type": i["content_type"], "size": i["size"]}
            for i in images
        ] or None,
    }


def _poll_account_sync(host: str, username: str, password: str, since: datetime) -> List[Dict[str, Any]]:
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
            content = _extract_content(msg)
            found.append({
                "message_id": (msg.get("Message-ID") or "").strip()[:255] or None,
                "from_email": from_email.strip().lower()[:255],
                "from_name": from_name.strip()[:255] or None,
                "subject": _decode(msg.get("Subject"))[:500] or None,
                "received_at": received,
                **content,
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
        messages = await asyncio.to_thread(_poll_account_sync, host, username, password, since)
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
            body_html=m["body_html"],
            attachments=m["attachments"],
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


def _row_dict(r: EmailReply) -> Dict[str, Any]:
    return {
        "id": r.id,
        "from_email": r.from_email,
        "from_name": r.from_name,
        "subject": r.subject,
        "body_preview": r.body_preview,
        "body_html": r.body_html,
        "attachments": r.attachments,
        "received_at": r.received_at,
        "is_read": r.is_read,
    }


class EmailReplyService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.workspace_id = user_id
        self.accounts = EmailAccountService(db, user_id)

    async def list(self, limit: int = 20, offset: int = 0, search: Optional[str] = None) -> List[Dict[str, Any]]:
        # Capped by default and paginated via offset/limit rather than
        # dumping every reply into one unbounded list -- a busy inbox could
        # have hundreds of these.
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
            await self.db.execute(
                q.order_by(EmailReply.created_at.desc()).offset(max(0, offset)).limit(min(max(1, limit), 100))
            )
        ).scalars()
        return [_row_dict(r) for r in rows]

    async def unread_count(self) -> int:
        from sqlalchemy import func

        res = await self.db.execute(
            select(func.count()).select_from(EmailReply).where(
                EmailReply.workspace_id == self.workspace_id, EmailReply.is_read.is_(False)
            )
        )
        return int(res.scalar() or 0)

    async def _get(self, reply_id: str) -> EmailReply:
        row = (
            await self.db.execute(
                select(EmailReply).where(EmailReply.id == reply_id, EmailReply.workspace_id == self.workspace_id)
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Reply not found")
        return row

    async def mark_read(self, reply_id: str) -> None:
        row = await self._get(reply_id)
        row.is_read = True
        await self.db.commit()

    async def delete(self, reply_id: str) -> None:
        row = await self._get(reply_id)
        await self.db.delete(row)
        await self.db.commit()

    async def reply(self, reply_id: str, body: str, email_account_id: Optional[str] = None) -> Dict[str, Any]:
        """Sends a plain reply back to whoever sent this message, from the
        same account that received it (or a chosen one)."""
        original = await self._get(reply_id)
        acc = await self.accounts.get_model(email_account_id or original.email_account_id)
        cfg = self.accounts.smtp_config(acc)
        if not cfg.host or not cfg.password:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That sending account is not fully configured.")

        subject = original.subject or ""
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}".strip()
        outcome = await send_email(cfg, original.from_email, subject, body)
        if not outcome.ok:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, outcome.error or "Send failed")
        return {"sent": True, "to": original.from_email}
