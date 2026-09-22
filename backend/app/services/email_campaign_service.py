"""Tenant bulk email — compose one message and send it to many contacts
(Leads, CRM customers, or a pasted list) from the workspace's own sending
identity, with {{merge}} fields, the account's daily cap, and paced sends.

Per-recipient audit rows go to `email_sends`; aggregate counts to
`email_campaigns` (the history view).
"""
from __future__ import annotations

import asyncio
import csv
import io
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.customer import Customer
from app.models.email_account import EmailAccount
from app.models.email_campaign import EmailCampaign
from app.models.email_send import EmailSend, EmailSendStatus
from app.models.lead import Lead
from app.models.user import User
from app.services.email_account_service import EmailAccountService
from app.services.email_sender import render_branded_html, send_email

_GAP_SECONDS = 1.0
_MERGE_RE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}", re.IGNORECASE)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# CSV import -- same tolerant approach as the Bulk SMS contact importer
# (messaging_service.parse_contacts_csv): works with or without a header
# row, whatever delimiter, extra columns, by scanning for the pattern
# (a valid email address) rather than requiring a specific header name.
_EMAIL_HEADER_HINTS = ("email", "mail")
_NAME_HEADERS = {
    "name", "full name", "fullname", "contact name", "contact person", "customer name",
    "client name", "first name", "firstname", "recipient", "recipient name", "business",
    "business name", "company", "company name",
}
_NAME_HEADER_HINTS = ("name", "business", "company", "client", "customer", "person")
_CSV_MAX_ROWS = 2000  # matches send()'s own per-campaign recipient cap


def parse_email_csv(raw: bytes) -> Dict[str, Any]:
    """Pull {name, email} out of an uploaded CSV."""
    text = raw.decode("utf-8-sig", errors="replace").strip()
    if not text:
        return {"recipients": [], "imported": 0, "skipped": 0, "columns": []}

    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
    if not rows:
        return {"recipients": [], "imported": 0, "skipped": 0, "columns": []}

    header = [c.strip() for c in rows[0]]
    has_header = not any(_EMAIL_RE.match(c.strip().lower()) for c in header) and any(header)
    data_rows = rows[1:] if has_header else rows

    email_idx: Optional[int] = None
    name_idx: Optional[int] = None
    if has_header:
        low = [h.lower() for h in header]
        for i, h in enumerate(low):
            if email_idx is None and any(k in h for k in _EMAIL_HEADER_HINTS):
                email_idx = i
            if name_idx is None and (h in _NAME_HEADERS or any(k in h for k in _NAME_HEADER_HINTS)):
                name_idx = i
    if email_idx is None:  # scan columns, pick the one with the most valid emails
        hits: Dict[int, int] = {}
        for r in data_rows[:60]:
            for i, c in enumerate(r):
                if _EMAIL_RE.match(c.strip().lower()):
                    hits[i] = hits.get(i, 0) + 1
        if hits:
            email_idx = max(hits, key=hits.get)

    if name_idx is None and email_idx is not None:
        text_hits: Dict[int, int] = {}
        for r in data_rows[:60]:
            for i, c in enumerate(r):
                if i == email_idx:
                    continue
                s = c.strip()
                if s and not _EMAIL_RE.match(s.lower()):
                    text_hits[i] = text_hits.get(i, 0) + 1
        if text_hits:
            name_idx = max(text_hits, key=text_hits.get)

    recipients: List[Dict[str, Any]] = []
    seen: set = set()
    imported = skipped = 0
    for r in data_rows:
        email = None
        if email_idx is not None and email_idx < len(r):
            candidate = r[email_idx].strip().lower()
            if _EMAIL_RE.match(candidate):
                email = candidate
        if not email:
            email = next((c.strip().lower() for c in r if _EMAIL_RE.match(c.strip().lower())), None)
        if not email or email in seen:
            skipped += 1
            continue
        seen.add(email)
        name = ""
        if name_idx is not None and name_idx < len(r) and r[name_idx].strip():
            name = r[name_idx].strip()[:160]
        recipients.append({"email": email, "name": name})
        imported += 1
        if imported >= _CSV_MAX_ROWS:
            break

    return {
        "recipients": recipients,
        "imported": imported,
        "skipped": skipped,
        "columns": header if has_header else [],
    }


def _merge(text: str, ctx: Dict[str, str]) -> str:
    def sub(m: re.Match) -> str:
        key = m.group(1).lower()
        return str(ctx.get(key, m.group(0)))

    return _MERGE_RE.sub(sub, text or "")


class EmailCampaignService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id
        self.accounts = EmailAccountService(db, user_id)

    # ----------------------------------------------------------- recipients
    async def resolve_recipients(
        self,
        source: str,
        *,
        ids: Optional[List[str]] = None,
        manual: Optional[List[Dict[str, str]]] = None,
    ) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        if source == "manual":
            for row in manual or []:
                email = (row.get("email") or "").strip().lower()
                if _EMAIL_RE.match(email):
                    out.append({"email": email, "name": (row.get("name") or "").strip(), "company": ""})
        elif source == "leads":
            q = select(Lead).where(Lead.workspace_id == self.workspace_id, Lead.email.isnot(None))
            if ids:
                q = q.where(Lead.id.in_(ids))
            for l in (await self.db.execute(q)).scalars():
                if l.email and _EMAIL_RE.match(l.email.strip().lower()):
                    out.append({"email": l.email.strip().lower(), "name": l.name or "", "company": l.company or ""})
        elif source == "customers":
            q = select(Customer).where(Customer.workspace_id == self.workspace_id, Customer.email.isnot(None))
            if ids:
                q = q.where(Customer.id.in_(ids))
            for c in (await self.db.execute(q)).scalars():
                if c.email and _EMAIL_RE.match(c.email.strip().lower()):
                    out.append({"email": c.email.strip().lower(), "name": c.name or "", "company": c.company or ""})
        else:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "source must be manual, leads or customers")

        # de-dupe by email, keep first
        seen: set = set()
        unique = []
        for r in out:
            if r["email"] not in seen:
                seen.add(r["email"])
                unique.append(r)
        return unique

    # ---------------------------------------------------------------- send
    async def send(
        self,
        *,
        subject: str,
        body: str,
        email_account_id: Optional[str],
        source: str,
        ids: Optional[List[str]] = None,
        manual: Optional[List[Dict[str, str]]] = None,
        reply_to: Optional[str] = None,
    ) -> Dict[str, Any]:
        acc = (
            await self.accounts.get_model(email_account_id)
            if email_account_id
            else await self.accounts.default_account()
        )
        if not acc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Add a sending email account in Settings first.",
            )
        cfg = self.accounts.smtp_config(acc)
        if not cfg.host or not cfg.password:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That sending account is not fully configured.")

        # Every reply from a customer — Reply or Reply All — goes to this
        # address. An explicit per-campaign value wins; otherwise the sending
        # account's own reply-to; otherwise unset (mail clients fall back to
        # the From address).
        reply_to = (reply_to or "").strip() or None
        if reply_to and not _EMAIL_RE.match(reply_to.lower()):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "The 'replies go to' address is not a valid email.",
            )
        effective_reply_to = reply_to or acc.reply_to or None
        cfg.reply_to = effective_reply_to

        recipients = await self.resolve_recipients(source, ids=ids, manual=manual)
        if not recipients:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No valid recipient email addresses.")
        if len(recipients) > 2000:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max 2,000 recipients per send.")

        campaign = EmailCampaign(
            workspace_id=self.workspace_id,
            subject=subject[:500],
            body=body,
            email_account_id=acc.id,
            source=source,
            reply_to=effective_reply_to,
            total=len(recipients),
            status="sending",
            created_by=self.user_id,
        )
        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)

        # Workspace brand identity -- the same logo/colors already used for
        # AI-generated video/image branding, reused here so a business's
        # emails look consistent with the rest of what it sends out.
        user = (await self.db.execute(select(User).where(User.id == self.workspace_id))).scalar_one_or_none()
        logo_url = None
        if user and user.brand_logo_url:
            logo_url = user.brand_logo_url
            if logo_url.startswith("/"):
                logo_url = f"{settings.BACKEND_PUBLIC_URL.rstrip('/')}{logo_url}"
        brand_colors = user.brand_colors if user else None

        sent = failed = skipped = 0
        for r in recipients:
            ctx = {
                "name": r["name"] or "there",
                "first_name": (r["name"] or "there").split(" ")[0],
                "company": r["company"] or "",
                "email": r["email"],
            }
            if not await self.accounts.can_send(acc):
                skipped += 1
                self.db.add(EmailSend(
                    workspace_id=self.workspace_id, email_account_id=acc.id, email_campaign_id=campaign.id,
                    to_email=r["email"], from_email=acc.from_email, subject=subject,
                    status=EmailSendStatus.SKIPPED, error="Daily sending limit reached",
                ))
                continue

            merged_subject = _merge(subject, ctx)
            merged_body = _merge(body, ctx)
            merged_signature = _merge(acc.signature, ctx) if acc.signature else None
            plain_body = f"{merged_body}\n\n{merged_signature}" if merged_signature else merged_body
            branded_html = render_branded_html(
                merged_body,
                logo_url=logo_url,
                brand_colors=brand_colors,
                signature=merged_signature,
                contact_phone=user.phone if user else None,
                contact_website=user.website if user else None,
            )

            outcome = await send_email(cfg, r["email"], merged_subject, plain_body, html=branded_html)
            await self.accounts.record_send(acc, outcome.ok, outcome.error)
            self.db.add(EmailSend(
                workspace_id=self.workspace_id, email_account_id=acc.id, email_campaign_id=campaign.id,
                to_email=r["email"], from_email=acc.from_email, subject=merged_subject,
                body_preview=merged_body[:400],
                status=EmailSendStatus.SENT if outcome.ok else EmailSendStatus.FAILED,
                error=outcome.error, provider_message_id=outcome.message_id,
                sent_at=datetime.now(timezone.utc) if outcome.ok else None,
            ))
            if outcome.ok:
                sent += 1
            else:
                failed += 1
            await self.db.commit()
            await asyncio.sleep(_GAP_SECONDS)

        campaign.sent, campaign.failed, campaign.skipped = sent, failed, skipped
        campaign.status = "completed" if failed < campaign.total else "failed"
        await self.db.commit()
        await self.db.refresh(campaign)
        return _campaign_dict(campaign)

    async def campaign_sends(self, campaign_id: str) -> List[Dict[str, Any]]:
        # scoped to this workspace so one tenant can never read another's send log
        owns = await self.db.execute(
            select(EmailCampaign.id).where(
                EmailCampaign.id == campaign_id, EmailCampaign.workspace_id == self.workspace_id
            )
        )
        if not owns.scalar_one_or_none():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
        rows = (
            await self.db.execute(
                select(EmailSend)
                .where(EmailSend.email_campaign_id == campaign_id)
                .order_by(EmailSend.created_at.asc())
            )
        ).scalars()
        return [
            {
                "to_email": r.to_email,
                "status": r.status.value,
                "error": r.error,
                "sent_at": r.sent_at,
            }
            for r in rows
        ]

    async def history(self, limit: int = 50) -> List[Dict[str, Any]]:
        rows = (
            await self.db.execute(
                select(EmailCampaign)
                .where(EmailCampaign.workspace_id == self.workspace_id)
                .order_by(EmailCampaign.created_at.desc())
                .limit(limit)
            )
        ).scalars()
        return [_campaign_dict(c) for c in rows]

    async def delete_campaign(self, campaign_id: str) -> None:
        campaign = (
            await self.db.execute(
                select(EmailCampaign).where(
                    EmailCampaign.id == campaign_id, EmailCampaign.workspace_id == self.workspace_id
                )
            )
        ).scalar_one_or_none()
        if not campaign:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
        # per-recipient audit rows reference this campaign; drop them together
        # rather than leaving orphaned EmailSend rows behind
        sends = await self.db.execute(select(EmailSend).where(EmailSend.email_campaign_id == campaign_id))
        for s in sends.scalars():
            await self.db.delete(s)
        await self.db.delete(campaign)
        await self.db.commit()


def _campaign_dict(c: EmailCampaign) -> Dict[str, Any]:
    return {
        "id": c.id,
        "subject": c.subject,
        "source": c.source,
        "reply_to": c.reply_to,
        "total": c.total,
        "sent": c.sent,
        "failed": c.failed,
        "skipped": c.skipped,
        "status": c.status,
        "created_at": c.created_at,
    }
