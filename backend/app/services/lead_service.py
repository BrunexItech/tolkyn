from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, desc, update, delete
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.models.lead import Lead, LeadStatus, LeadScore, LeadSource
from app.models.user import User
from app.schemas.lead import (
    LeadCreate, LeadUpdate, LeadResponse,
    LeadSummaryResponse, LeadBulkAction, LeadStatusCount, LeadSourceCount,
)

_SCORE_MAP = {
    "hot": LeadScore.HOT,
    "warm": LeadScore.WARM,
    "cold": LeadScore.COLD,
    "unknown": LeadScore.UNKNOWN,
}


class LeadService:
    """Lead management, scoped to a single workspace (= the calling user)."""

    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        # single-tenant-per-user model: the user's id is their workspace id
        self.workspace_id = user_id

    # --------------------------------------------------------------- create
    async def create_lead(self, data: LeadCreate) -> LeadResponse:
        if await self._is_duplicate(data.email, data.name, data.company):
            raise HTTPException(status.HTTP_409_CONFLICT, "Lead already exists")

        lead = Lead(
            name=data.name,
            email=data.email,
            phone=data.phone,
            company=data.company,
            position=data.position,
            industry=data.industry,
            linkedin_url=data.linkedin_url,
            instagram_handle=data.instagram_handle,
            facebook_url=data.facebook_url,
            twitter_handle=data.twitter_handle,
            website_url=data.website_url,
            location=data.location,
            country=data.country,
            city=data.city,
            source=data.source,
            status=data.status,
            tags=data.tags or [],
            notes=data.notes,
            estimated_value=data.estimated_value,
            decision_maker=data.decision_maker,
            assigned_to=data.assigned_to,
            workspace_id=self.workspace_id,
            owner_id=self.user_id,
            custom_fields={},
        )
        self.db.add(lead)
        await self.db.commit()
        await self.db.refresh(lead)
        await self._emit_new_lead(lead)
        return self._to_response(lead)

    async def create_lead_with_ai(
        self, data: LeadCreate, ai: Dict[str, Any]
    ) -> Optional[LeadResponse]:
        """Create a lead and attach an enrichment payload. Returns None on duplicate."""
        if await self._is_duplicate(data.email, data.name, data.company):
            return None

        rating = str(ai.get("rating", "unknown")).lower()
        lead = Lead(
            name=data.name[:255],
            email=data.email,
            phone=data.phone,
            company=(data.company or "")[:255] or None,
            position=data.position,
            industry=data.industry,
            linkedin_url=data.linkedin_url,
            instagram_handle=data.instagram_handle,
            facebook_url=data.facebook_url,
            twitter_handle=data.twitter_handle,
            website_url=data.website_url,
            location=data.location,
            country=data.country,
            city=data.city,
            source=data.source,
            status=data.status,
            score=_SCORE_MAP.get(rating, LeadScore.UNKNOWN),
            tags=data.tags or [],
            notes=data.notes,
            ai_confidence_score=float(ai.get("score", 50)),
            ai_summary=ai.get("summary", ""),
            ai_recommendation=ai.get("recommendation", ""),
            ai_intent_signals=ai.get("intent_signals", []),
            ai_processed_at=datetime.now(timezone.utc),
            custom_fields={
                "outreach_angle": ai.get("outreach_angle", ""),
                "seniority": ai.get("seniority", "unknown"),
                "enriched_by": ai.get("enriched_by", "heuristic"),
                "key_facts": ai.get("key_facts", []),
                "discovery_prompt": ai.get("discovery_prompt", ""),
                "offer": ai.get("offer", ""),
                "from_company": ai.get("from_company", ""),
                "from_website": ai.get("from_website", ""),
            },
            workspace_id=self.workspace_id,
            owner_id=self.user_id,
        )
        self.db.add(lead)
        await self.db.commit()
        await self.db.refresh(lead)
        await self._emit_new_lead(lead)
        return self._to_response(lead)

    async def _emit_new_lead(self, lead: Lead) -> None:
        from app.services.automation_bus import emit

        try:
            await emit(
                self.db,
                self.workspace_id,
                "new_lead",
                {
                    "lead_id": lead.id,
                    "name": lead.name,
                    "score": (lead.score.value if lead.score else "unknown"),
                    "phone": lead.phone,
                    "label": f"new lead '{lead.name}'",
                },
            )
        except Exception as exc:  # noqa: BLE001 - automations must never break lead capture
            print(f"[automations] new_lead emit failed: {exc}")

    # ----------------------------------------------------------------- read
    async def get_lead(self, lead_id: str) -> LeadResponse:
        lead = await self._get_owned(lead_id)
        return self._to_response(lead)

    async def list_leads(
        self,
        *,
        status_filter: Optional[str] = None,
        score: Optional[str] = None,
        source: Optional[str] = None,
        search: Optional[str] = None,
        converted: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[List[LeadResponse], int]:
        base = select(Lead).where(Lead.workspace_id == self.workspace_id)
        count_q = select(func.count()).select_from(Lead).where(Lead.workspace_id == self.workspace_id)

        def apply(q):
            if status_filter:
                q = q.where(Lead.status == status_filter)
            if score:
                q = q.where(Lead.score == score)
            if source:
                q = q.where(Lead.source == source)
            if converted is True:
                q = q.where(Lead.converted_customer_id.isnot(None))
            if converted is False:
                q = q.where(Lead.converted_customer_id.is_(None))
            if search:
                like = f"%{search}%"
                q = q.where(
                    or_(
                        Lead.name.ilike(like),
                        Lead.company.ilike(like),
                        Lead.email.ilike(like),
                        Lead.position.ilike(like),
                    )
                )
            return q

        rows = (
            await self.db.execute(
                apply(base).order_by(desc(Lead.created_at)).limit(limit).offset(offset)
            )
        ).scalars().all()
        total = (await self.db.execute(apply(count_q))).scalar() or 0
        return [self._to_response(r) for r in rows], total

    async def summary(self) -> LeadSummaryResponse:
        rows = (
            await self.db.execute(select(Lead).where(Lead.workspace_id == self.workspace_id))
        ).scalars().all()
        total = len(rows)
        won = sum(1 for l in rows if l.status == LeadStatus.CLOSED_WON or l.converted_customer_id)
        return LeadSummaryResponse(
            total_leads=total,
            hot_leads=sum(1 for l in rows if l.score == LeadScore.HOT),
            warm_leads=sum(1 for l in rows if l.score == LeadScore.WARM),
            cold_leads=sum(1 for l in rows if l.score == LeadScore.COLD),
            new_leads=sum(1 for l in rows if l.status == LeadStatus.NEW),
            contacted_leads=sum(1 for l in rows if l.status == LeadStatus.CONTACTED),
            qualified_leads=sum(1 for l in rows if l.status == LeadStatus.QUALIFIED),
            closed_won_leads=won,
            conversion_rate=round(won / total * 100, 1) if total else 0.0,
        )

    async def status_counts(self) -> List[LeadStatusCount]:
        rows = await self.db.execute(
            select(Lead.status, func.count())
            .where(Lead.workspace_id == self.workspace_id)
            .group_by(Lead.status)
        )
        return [LeadStatusCount(status=str(r[0].value if r[0] else "unknown"), count=r[1]) for r in rows]

    async def source_counts(self) -> List[LeadSourceCount]:
        rows = await self.db.execute(
            select(Lead.source, func.count())
            .where(Lead.workspace_id == self.workspace_id)
            .group_by(Lead.source)
        )
        return [LeadSourceCount(source=str(r[0].value if r[0] else "unknown"), count=r[1]) for r in rows]

    # --------------------------------------------------------------- mutate
    async def update_lead(self, lead_id: str, data: LeadUpdate) -> LeadResponse:
        lead = await self._get_owned(lead_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(lead, key, value)
        lead.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(lead)
        return self._to_response(lead)

    async def delete_lead(self, lead_id: str) -> None:
        lead = await self._get_owned(lead_id)
        await self.db.delete(lead)
        await self.db.commit()

    async def bulk_action(self, data: LeadBulkAction) -> Dict[str, Any]:
        ids = data.lead_ids
        scoped = Lead.id.in_(ids) & (Lead.workspace_id == self.workspace_id)

        if data.action == "update_status":
            await self.db.execute(
                update(Lead).where(scoped).values(
                    status=data.data.get("status"), updated_at=datetime.now(timezone.utc)
                )
            )
        elif data.action == "assign":
            await self.db.execute(
                update(Lead).where(scoped).values(
                    assigned_to=data.data.get("assigned_to"), updated_at=datetime.now(timezone.utc)
                )
            )
        elif data.action == "delete":
            await self.db.execute(delete(Lead).where(scoped))
        elif data.action == "add_tags":
            tags = data.data.get("tags", [])
            for lead_id in ids:
                lead = await self._get_owned_or_none(lead_id)
                if lead:
                    lead.tags = sorted(set((lead.tags or []) + tags))
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid action")

        await self.db.commit()
        return {"success": True, "affected": len(ids)}

    async def save_outreach(
        self, lead_id: str, subject: str, email_body: str, proposal: str
    ) -> Lead:
        lead = await self._get_owned(lead_id)
        lead.outreach_subject = subject[:255]
        lead.outreach_email = email_body
        lead.outreach_proposal = proposal
        lead.outreach_generated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(lead)
        return lead

    async def mark_converted(self, lead_id: str, customer_id: str) -> None:
        lead = await self._get_owned(lead_id)
        lead.converted_customer_id = customer_id
        lead.converted_at = datetime.now(timezone.utc)
        lead.status = LeadStatus.CLOSED_WON
        await self.db.commit()

    async def get_owned_model(self, lead_id: str) -> Lead:
        return await self._get_owned(lead_id)

    # -------------------------------------------------------------- private
    async def _get_owned(self, lead_id: str) -> Lead:
        lead = await self._get_owned_or_none(lead_id)
        if not lead:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        return lead

    async def _get_owned_or_none(self, lead_id: str) -> Optional[Lead]:
        res = await self.db.execute(
            select(Lead).where(Lead.id == lead_id, Lead.workspace_id == self.workspace_id)
        )
        return res.scalar_one_or_none()

    async def _is_duplicate(self, email: Optional[str], name: str, company: Optional[str]) -> bool:
        if email:
            res = await self.db.execute(
                select(Lead.id).where(
                    Lead.workspace_id == self.workspace_id, Lead.email == email
                )
            )
            if res.scalar_one_or_none():
                return True
        if company and name:
            res = await self.db.execute(
                select(Lead.id).where(
                    Lead.workspace_id == self.workspace_id,
                    Lead.name == name,
                    Lead.company == company,
                )
            )
            if res.scalar_one_or_none():
                return True
        return False

    def _to_response(self, lead: Lead) -> LeadResponse:
        cf = lead.custom_fields or {}
        return LeadResponse(
            id=lead.id,
            name=lead.name,
            email=lead.email,
            phone=lead.phone,
            company=lead.company,
            position=lead.position,
            industry=lead.industry,
            linkedin_url=lead.linkedin_url,
            instagram_handle=lead.instagram_handle,
            facebook_url=lead.facebook_url,
            twitter_handle=lead.twitter_handle,
            website_url=lead.website_url,
            location=lead.location,
            country=lead.country,
            city=lead.city,
            source=lead.source,
            status=lead.status,
            score=lead.score,
            engagement_level=lead.engagement_level,
            ai_confidence_score=lead.ai_confidence_score,
            ai_summary=lead.ai_summary,
            ai_recommendation=lead.ai_recommendation,
            ai_intent_signals=lead.ai_intent_signals,
            engagement_count=lead.engagement_count or 0,
            last_contact_date=lead.last_contact_date,
            next_follow_up_date=lead.next_follow_up_date,
            estimated_value=lead.estimated_value,
            budget_range=lead.budget_range,
            decision_maker=bool(lead.decision_maker),
            tags=lead.tags or [],
            notes=lead.notes,
            assigned_to=lead.assigned_to,
            assigned_to_name=None,
            workspace_id=lead.workspace_id,
            converted_customer_id=lead.converted_customer_id,
            converted_at=lead.converted_at,
            outreach_angle=cf.get("outreach_angle"),
            seniority=cf.get("seniority"),
            key_facts=cf.get("key_facts") or [],
            offer=cf.get("offer") or None,
            sender_company=cf.get("from_company") or None,
            has_outreach=bool(lead.outreach_email),
            outreach_subject=lead.outreach_subject,
            outreach_email=lead.outreach_email,
            outreach_proposal=lead.outreach_proposal,
            outreach_generated_at=lead.outreach_generated_at,
            outreach_sent_at=lead.outreach_sent_at,
            outreach_sent_count=lead.outreach_sent_count or 0,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )
