from datetime import datetime, timezone
from typing import List

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_account import EmailAccount
from app.models.email_send import EmailSend, EmailSendStatus
from app.models.lead import Lead
from app.schemas.email_account import BulkSendResult, SendResult
from app.services.email_account_service import EmailAccountService
from app.services.email_sender import send_email
from app.services.lead_service import LeadService

_FOOTER = (
    "\n\n—\nYou received this because we believe there may be a fit between our businesses. "
    "Reply STOP or let us know and we won't contact you again."
)


class OutreachSendService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id
        self.leads = LeadService(db, user_id)
        self.accounts = EmailAccountService(db, user_id)

    async def send_one(self, lead_id: str, account_id: str, include_proposal: bool) -> SendResult:
        acc = await self.accounts.get_model(account_id)
        lead = await self.leads.get_owned_model(lead_id)
        return await self._send(lead, acc, include_proposal)

    async def send_bulk(
        self, lead_ids: List[str], account_id: str, include_proposal: bool
    ) -> BulkSendResult:
        acc = await self.accounts.get_model(account_id)
        results: List[SendResult] = []
        for lid in lead_ids:
            try:
                lead = await self.leads.get_owned_model(lid)
            except HTTPException:
                results.append(SendResult(lead_id=lid, status="skipped", detail="Lead not found"))
                continue
            results.append(await self._send(lead, acc, include_proposal))

        return BulkSendResult(
            sent=sum(1 for r in results if r.status == "sent"),
            failed=sum(1 for r in results if r.status == "failed"),
            skipped=sum(1 for r in results if r.status == "skipped"),
            results=results,
        )

    # ------------------------------------------------------------- internal
    async def _send(
        self, lead: Lead, acc: EmailAccount, include_proposal: bool
    ) -> SendResult:
        if not lead.email:
            return await self._log_skip(lead, acc, "No email address for this lead")
        if not lead.outreach_email:
            return await self._log_skip(lead, acc, "No email drafted — generate outreach first")
        if not await self.accounts.can_send(acc):
            return await self._log_skip(lead, acc, "Daily sending limit reached for this account")

        cfg = self.accounts.smtp_config(acc)
        if not cfg.host or not cfg.password:
            return await self._log_skip(lead, acc, "Sending account is not fully configured")

        body = lead.outreach_email
        if acc.signature:
            body = f"{body}\n\n{acc.signature}"
        body = f"{body}{_FOOTER}"

        attachment = None
        if include_proposal and lead.outreach_proposal:
            fname = f"proposal-{(lead.company or lead.name or 'lead').lower().replace(' ', '-')}.md"
            attachment = (fname, lead.outreach_proposal)

        subject = lead.outreach_subject or f"A note for {lead.company or lead.name}"
        outcome = await send_email(cfg, lead.email, subject, body, attachment)

        await self.accounts.record_send(acc, outcome.ok, outcome.error)

        send = EmailSend(
            workspace_id=self.workspace_id,
            email_account_id=acc.id,
            lead_id=lead.id,
            to_email=lead.email,
            from_email=acc.from_email,
            subject=subject,
            body_preview=body[:400],
            status=EmailSendStatus.SENT if outcome.ok else EmailSendStatus.FAILED,
            error=outcome.error,
            provider_message_id=outcome.message_id,
            sent_at=datetime.now(timezone.utc) if outcome.ok else None,
        )
        self.db.add(send)

        if outcome.ok:
            lead.outreach_sent_at = datetime.now(timezone.utc)
            lead.outreach_sent_count = (lead.outreach_sent_count or 0) + 1

        await self.db.commit()

        if outcome.ok:
            return SendResult(lead_id=lead.id, to_email=lead.email, status="sent")
        return SendResult(lead_id=lead.id, to_email=lead.email, status="failed", detail=outcome.error)

    async def _log_skip(self, lead: Lead, acc: EmailAccount, reason: str) -> SendResult:
        self.db.add(
            EmailSend(
                workspace_id=self.workspace_id,
                email_account_id=acc.id,
                lead_id=lead.id,
                to_email=lead.email or "",
                from_email=acc.from_email,
                subject=lead.outreach_subject,
                status=EmailSendStatus.SKIPPED,
                error=reason,
            )
        )
        await self.db.commit()
        return SendResult(lead_id=lead.id, to_email=lead.email, status="skipped", detail=reason)
