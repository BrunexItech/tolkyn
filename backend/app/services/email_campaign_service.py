"""Tenant bulk email — compose one message and send it to many contacts
(Leads, CRM customers, or a pasted list) from the workspace's own sending
identity, with {{merge}} fields, the account's daily cap, and paced sends.

Per-recipient audit rows go to `email_sends`; aggregate counts to
`email_campaigns` (the history view).
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.email_account import EmailAccount
from app.models.email_campaign import EmailCampaign
from app.models.email_send import EmailSend, EmailSendStatus
from app.models.lead import Lead
from app.services.email_account_service import EmailAccountService
from app.services.email_sender import send_email

_GAP_SECONDS = 1.0
_MERGE_RE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}", re.IGNORECASE)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


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
            total=len(recipients),
            status="sending",
            created_by=self.user_id,
        )
        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)

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
            if acc.signature:
                merged_body = f"{merged_body}\n\n{acc.signature}"

            outcome = await send_email(cfg, r["email"], merged_subject, merged_body)
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


def _campaign_dict(c: EmailCampaign) -> Dict[str, Any]:
    return {
        "id": c.id,
        "subject": c.subject,
        "source": c.source,
        "total": c.total,
        "sent": c.sent,
        "failed": c.failed,
        "skipped": c.skipped,
        "status": c.status,
        "created_at": c.created_at,
    }
