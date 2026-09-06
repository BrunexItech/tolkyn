"""Turn real social comments / DMs into a classified lead pipeline that lives
next to the CRM.

Flow:
  1. Make sure the Social Inbox is synced (it pulls real comments + IG DMs from
     Upload-Post).
  2. Walk the comment / mention / DM threads.
  3. Ask the AI (or a heuristic fallback) whether each new inbound message is a
     potential product lead.
  4. Upsert a SocialLead row, keyed to the inbox thread.
"""
from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status as http_status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer, CustomerSource, CustomerStage, CustomerStatus
from app.models.inbox import InboxThread, ThreadKind
from app.models.social_lead import SocialLead, SocialLeadIntent, SocialLeadStatus
from app.services.ai_client import ai
from app.services.inbox_service import InboxService
from app.services.social_lead_ai import classify_message
from app.services.upload_post_client import upload_post

# workspace_id -> last scan epoch
_LAST_SCAN: Dict[str, float] = {}
_SCAN_TTL = 240.0  # 4 min
_MAX_NEW_PER_SCAN = 30
_CLASSIFY_CONCURRENCY = 4

# statuses the user has taken ownership of — a re-scan never resets these
_LOCKED_STATUSES = {
    SocialLeadStatus.CONVERTED,
    SocialLeadStatus.DISMISSED,
    SocialLeadStatus.QUALIFIED,
    SocialLeadStatus.CONTACTED,
}

_LEAD_KINDS = {ThreadKind.COMMENT, ThreadKind.MENTION, ThreadKind.DM}


def _now() -> datetime:
    return datetime.now(timezone.utc)


class SocialLeadService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id
        self.inbox = InboxService(db, user_id)

    # ------------------------------------------------------------------ scan
    async def scan(self, *, force: bool = False, max_new: int = _MAX_NEW_PER_SCAN) -> Dict[str, Any]:
        last = _LAST_SCAN.get(self.workspace_id, 0.0)
        if not force and time.time() - last < _SCAN_TTL:
            return {
                "scanned": 0, "classified": 0, "new_leads": 0, "updated": 0,
                "message": "Already up to date.", "ai": ai().available,
                "live": upload_post.enabled,
            }

        # pull fresh comments / DMs into the inbox first
        try:
            await self.inbox.sync(force=force)
        except Exception as exc:  # noqa: BLE001
            print(f"[social_lead] inbox sync skipped: {exc}")

        threads = (
            await self.db.execute(
                select(InboxThread)
                .options(selectinload(InboxThread.messages))
                .where(InboxThread.workspace_id == self.workspace_id)
                .order_by(InboxThread.last_message_at.desc())
            )
        ).scalars().all()
        threads = [t for t in threads if t.kind in _LEAD_KINDS]

        existing = {
            sl.thread_external_id or sl.inbox_thread_id: sl
            for sl in (
                await self.db.execute(
                    select(SocialLead).where(SocialLead.workspace_id == self.workspace_id)
                )
            ).scalars().all()
        }

        # decide what needs (re)classifying
        pending: List[Dict[str, Any]] = []
        for t in threads:
            inbound = [m for m in t.messages if m.direction == "in" and (m.body or "").strip()]
            if not inbound:
                continue
            last_in = inbound[-1]
            last_at = last_in.at or last_in.created_at
            key = t.external_id or t.id
            row = existing.get(key)
            if row is not None:
                row_at = row.last_message_at
                if row_at and last_at and last_at <= row_at:
                    continue  # nothing new
            history = [
                {"author": m.author_name, "body": m.body}
                for m in t.messages if (m.body or "").strip()
            ]
            pending.append({
                "thread": t, "key": key, "row": row,
                "message": last_in.body, "last_at": last_at, "history": history,
            })

        pending = pending[: max(1, max_new)]
        if not pending:
            _LAST_SCAN[self.workspace_id] = time.time()
            return {
                "scanned": len(threads), "classified": 0, "new_leads": 0, "updated": 0,
                "message": "No new comments or messages to review.",
                "ai": ai().available, "live": upload_post.enabled,
            }

        sem = asyncio.Semaphore(_CLASSIFY_CONCURRENCY)

        async def run_one(item: Dict[str, Any]) -> Dict[str, Any]:
            t: InboxThread = item["thread"]
            async with sem:
                result = await classify_message(
                    item["message"],
                    post_context=t.context or "",
                    platform=t.platform,
                    author=t.author_name,
                    history=item["history"],
                )
            return {**item, "ai": result}

        classified = await asyncio.gather(*(run_one(i) for i in pending))

        new_leads = 0
        updated = 0
        for item in classified:
            t: InboxThread = item["thread"]
            r: Dict[str, Any] = item["ai"]
            row: Optional[SocialLead] = item["row"]
            intent = SocialLeadIntent(r["intent"])

            if row is None:
                row = SocialLead(
                    platform=t.platform,
                    kind=t.kind.value,
                    author_name=t.author_name,
                    author_handle=t.author_handle,
                    author_avatar=t.author_avatar,
                    message=item["message"][:6000],
                    post_context=(t.context or None),
                    permalink=t.permalink,
                    thread_external_id=t.external_id,
                    inbox_thread_id=t.id,
                    detected_at=_now(),
                    owner_id=self.user_id,
                    workspace_id=self.workspace_id,
                    status=SocialLeadStatus.NEW,
                )
                self.db.add(row)
                new_leads += 1
            else:
                updated += 1
                row.message = item["message"][:6000]
                row.author_avatar = t.author_avatar or row.author_avatar
                row.permalink = t.permalink or row.permalink
                row.inbox_thread_id = row.inbox_thread_id or t.id

            row.is_lead = bool(r["is_lead"])
            row.product_interest = r["product_interest"]
            row.intent = intent
            row.buying_signals = r["buying_signals"]
            row.sentiment = r["sentiment"]
            row.confidence = float(r["confidence"])
            row.ai_summary = r["summary"]
            row.suggested_reply = r["suggested_reply"]
            row.classifier = r.get("classifier")
            row.classified_at = _now()
            row.last_message_at = item["last_at"]
            if row.status not in _LOCKED_STATUSES:
                row.status = SocialLeadStatus.NEW

        await self.db.commit()
        _LAST_SCAN[self.workspace_id] = time.time()

        found = sum(1 for i in classified if i["ai"]["is_lead"])
        ai_used = any(i["ai"].get("classifier") == "openai" for i in classified)
        return {
            "scanned": len(threads),
            "classified": len(classified),
            "new_leads": new_leads,
            "updated": updated,
            "message": (
                f"Reviewed {len(classified)} message(s), found {found} potential lead(s)."
                if classified else "Nothing new to review."
            ),
            "ai": ai_used if classified else ai().available,
            "live": upload_post.enabled,
        }

    # ------------------------------------------------------------------ read
    async def list(
        self,
        *,
        status_filter: Optional[str] = None,
        intent: Optional[str] = None,
        platform: Optional[str] = None,
        leads_only: Optional[bool] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[List[SocialLead], int]:
        base = select(SocialLead).where(SocialLead.workspace_id == self.workspace_id)
        count_q = (
            select(func.count()).select_from(SocialLead)
            .where(SocialLead.workspace_id == self.workspace_id)
        )

        def apply(q):
            if status_filter:
                q = q.where(SocialLead.status == status_filter)
            if intent:
                q = q.where(SocialLead.intent == intent)
            if platform:
                q = q.where(SocialLead.platform == platform)
            if leads_only is True:
                q = q.where(SocialLead.is_lead.is_(True))
            if leads_only is False:
                q = q.where(SocialLead.is_lead.is_(False))
            if search:
                like = f"%{search}%"
                q = q.where(
                    or_(
                        SocialLead.author_name.ilike(like),
                        SocialLead.message.ilike(like),
                        SocialLead.product_interest.ilike(like),
                    )
                )
            return q

        rows = (
            await self.db.execute(
                apply(base)
                .order_by(SocialLead.is_lead.desc(), SocialLead.last_message_at.desc().nullslast())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()
        total = (await self.db.execute(apply(count_q))).scalar() or 0
        return list(rows), total

    async def get(self, lead_id: str) -> SocialLead:
        row = (
            await self.db.execute(
                select(SocialLead).where(
                    SocialLead.id == lead_id,
                    SocialLead.workspace_id == self.workspace_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Social lead not found")
        return row

    async def summary(self) -> Dict[str, Any]:
        rows = (
            await self.db.execute(
                select(SocialLead).where(SocialLead.workspace_id == self.workspace_id)
            )
        ).scalars().all()

        by_platform: Dict[str, int] = {}
        products: Dict[str, int] = {}
        for r in rows:
            if r.is_lead:
                by_platform[r.platform] = by_platform.get(r.platform, 0) + 1
                if r.product_interest:
                    key = r.product_interest.strip()
                    products[key] = products.get(key, 0) + 1

        by_product = sorted(
            ({"name": k, "count": v} for k, v in products.items()),
            key=lambda x: x["count"],
            reverse=True,
        )[:8]

        classifiers = {r.classifier for r in rows if r.classifier}
        ai_effective = ai().available and (
            not classifiers or "openai" in classifiers
        )

        return {
            "total": len(rows),
            "leads": sum(1 for r in rows if r.is_lead),
            "new": sum(1 for r in rows if r.is_lead and r.status == SocialLeadStatus.NEW),
            "hot": sum(1 for r in rows if r.is_lead and r.intent == SocialLeadIntent.HOT),
            "warm": sum(1 for r in rows if r.is_lead and r.intent == SocialLeadIntent.WARM),
            "cold": sum(1 for r in rows if r.is_lead and r.intent == SocialLeadIntent.COLD),
            "converted": sum(1 for r in rows if r.status == SocialLeadStatus.CONVERTED),
            "dismissed": sum(1 for r in rows if r.status == SocialLeadStatus.DISMISSED),
            "by_platform": by_platform,
            "by_product": by_product,
            "live": upload_post.enabled,
            "ai": ai_effective,
            "last_scan_at": (
                datetime.fromtimestamp(_LAST_SCAN[self.workspace_id], tz=timezone.utc)
                if self.workspace_id in _LAST_SCAN else None
            ),
        }

    # ---------------------------------------------------------------- mutate
    async def set_status(self, lead_id: str, new_status: str) -> SocialLead:
        row = await self.get(lead_id)
        row.status = SocialLeadStatus(new_status)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def reclassify(self, lead_id: str) -> SocialLead:
        row = await self.get(lead_id)
        result = await classify_message(
            row.message,
            post_context=row.post_context or "",
            platform=row.platform,
            author=row.author_name,
        )
        row.is_lead = bool(result["is_lead"])
        row.product_interest = result["product_interest"]
        row.intent = SocialLeadIntent(result["intent"])
        row.buying_signals = result["buying_signals"]
        row.sentiment = result["sentiment"]
        row.confidence = float(result["confidence"])
        row.ai_summary = result["summary"]
        row.suggested_reply = result["suggested_reply"]
        row.classifier = result.get("classifier")
        row.classified_at = _now()
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def reply(self, lead_id: str, body: str) -> SocialLead:
        row = await self.get(lead_id)
        if not row.inbox_thread_id:
            raise HTTPException(
                http_status.HTTP_409_CONFLICT,
                "This lead is not linked to an inbox thread — reply from the Social Inbox.",
            )
        await self.inbox.reply(row.inbox_thread_id, body, via="social-lead")
        if row.status == SocialLeadStatus.NEW:
            row.status = SocialLeadStatus.CONTACTED
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def convert(self, lead_id: str, opts) -> Dict[str, Any]:
        row = await self.get(lead_id)
        if row.converted_customer_id:
            existing = (
                await self.db.execute(
                    select(Customer).where(Customer.id == row.converted_customer_id)
                )
            ).scalar_one_or_none()
            if existing:
                return {"customer_id": existing.id, "already": True}

        try:
            stage = CustomerStage(opts.stage)
        except ValueError:
            stage = CustomerStage.PROSPECT

        note_bits = [f'Said on {row.platform}: "{row.message.strip()[:400]}"']
        if row.post_context:
            note_bits.append(f"On a post about: {row.post_context}")
        if row.buying_signals:
            note_bits.append("Signals: " + ", ".join(row.buying_signals))

        # A WhatsApp lead's handle IS the customer's real phone number — carry
        # it straight onto the CRM record so the team can call them.
        lead_phone = None
        if row.platform == "whatsapp" and re.match(r"^\+?\d[\d ()\-]{6,}$", row.author_handle or ""):
            lead_phone = re.sub(r"[ ()\-]", "", row.author_handle)

        customer = Customer(
            name=row.author_name[:255],
            email=(opts.email or None),
            phone=(opts.phone or lead_phone),
            company=None,
            instagram_handle=row.author_handle if row.platform == "instagram" else None,
            twitter_handle=row.author_handle if row.platform in ("x", "twitter") else None,
            stage=stage,
            status=CustomerStatus.ACTIVE,
            source=CustomerSource.SOCIAL,
            monthly_value=opts.monthly_value,
            next_action=opts.next_action or "Follow up on their comment",
            tags=["social", row.platform, "from-social-comment"],
            notes="\n".join(note_bits),
            ai_summary=row.ai_summary,
            ai_recommendation=row.suggested_reply,
            workspace_id=self.workspace_id,
            owner_id=self.user_id,
        )
        self.db.add(customer)
        await self.db.flush()

        row.converted_customer_id = customer.id
        row.status = SocialLeadStatus.CONVERTED
        await self.db.commit()
        return {"customer_id": customer.id, "already": False}
