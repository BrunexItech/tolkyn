from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer, CustomerSource, CustomerStage, CustomerStatus
from app.models.customer_interaction import CustomerInteraction
from app.models.lead import Lead
from app.schemas.customer import (
    ConvertLeadRequest,
    CustomerCreate,
    CustomerInteractionRow,
    CustomerResponse,
    CustomerSummary,
    CustomerUpdate,
    LogContactRequest,
)

# A customer with no logged contact in this many days (or never) counts as
# "needs follow-up" — used by both the summary tile and the toolbar filter.
FOLLOW_UP_DAYS = 30


class CustomerService:
    """CRM customer management, scoped to the calling user's workspace."""

    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    # --------------------------------------------------------------- create
    async def create(self, data: CustomerCreate) -> CustomerResponse:
        customer = Customer(
            **data.model_dump(exclude_unset=False),
            workspace_id=self.workspace_id,
            owner_id=self.user_id,
        )
        # model_dump gives enum members as their values already for str enums
        self.db.add(customer)
        await self.db.commit()
        await self.db.refresh(customer)
        return CustomerResponse.model_validate(customer)

    async def create_from_lead(self, lead: Lead, opts: ConvertLeadRequest) -> CustomerResponse:
        if lead.converted_customer_id:
            existing = await self._get_or_none(lead.converted_customer_id)
            if existing:
                return CustomerResponse.model_validate(existing)

        cf = lead.custom_fields or {}
        customer = Customer(
            name=lead.name,
            email=lead.email,
            phone=lead.phone,
            company=lead.company,
            position=lead.position,
            website_url=lead.website_url,
            location=lead.location,
            country=lead.country,
            linkedin_url=lead.linkedin_url,
            instagram_handle=lead.instagram_handle,
            twitter_handle=lead.twitter_handle,
            stage=opts.stage,
            status=CustomerStatus.ACTIVE,
            source=CustomerSource.LEAD,
            monthly_value=opts.monthly_value,
            lifetime_value=opts.lifetime_value or lead.estimated_value,
            next_action=opts.next_action,
            tags=list(lead.tags or []) + ["from-lead"],
            notes=lead.notes,
            ai_summary=lead.ai_summary,
            ai_recommendation=cf.get("outreach_angle") or lead.ai_recommendation,
            workspace_id=self.workspace_id,
            owner_id=self.user_id,
            lead_id=lead.id,
        )
        self.db.add(customer)
        await self.db.commit()
        await self.db.refresh(customer)
        return CustomerResponse.model_validate(customer)

    # ----------------------------------------------------------------- read
    async def get(self, customer_id: str) -> CustomerResponse:
        c = await self._get(customer_id)
        return CustomerResponse.model_validate(c)

    async def list(
        self,
        *,
        stage: Optional[str] = None,
        status_filter: Optional[str] = None,
        source: Optional[str] = None,
        search: Optional[str] = None,
        not_contacted_days: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[List[CustomerResponse], int]:
        base = select(Customer).where(Customer.workspace_id == self.workspace_id)
        count_q = (
            select(func.count()).select_from(Customer).where(Customer.workspace_id == self.workspace_id)
        )

        def apply(q):
            if stage:
                q = q.where(Customer.stage == stage)
            if status_filter:
                q = q.where(Customer.status == status_filter)
            if source:
                q = q.where(Customer.source == source)
            if not_contacted_days:
                cutoff = datetime.now(timezone.utc) - timedelta(days=not_contacted_days)
                q = q.where(
                    and_(
                        Customer.stage != CustomerStage.CHURNED,
                        or_(
                            Customer.last_contact_at.is_(None),
                            Customer.last_contact_at < cutoff,
                        ),
                    )
                )
            if search:
                like = f"%{search}%"
                q = q.where(
                    or_(
                        Customer.name.ilike(like),
                        Customer.company.ilike(like),
                        Customer.email.ilike(like),
                        Customer.position.ilike(like),
                    )
                )
            return q

        rows = (
            await self.db.execute(
                apply(base).order_by(desc(Customer.created_at)).limit(limit).offset(offset)
            )
        ).scalars().all()
        total = (await self.db.execute(apply(count_q))).scalar() or 0
        return [CustomerResponse.model_validate(r) for r in rows], total

    async def summary(self) -> CustomerSummary:
        rows = (
            await self.db.execute(
                select(Customer).where(Customer.workspace_id == self.workspace_id)
            )
        ).scalars().all()
        by_stage: Dict[str, int] = {}
        for s in CustomerStage:
            by_stage[s.value] = sum(1 for c in rows if c.stage == s)
        now = datetime.now(timezone.utc)
        this_month = sum(
            1
            for c in rows
            if c.created_at and c.created_at.year == now.year and c.created_at.month == now.month
        )
        cutoff = now - timedelta(days=FOLLOW_UP_DAYS)
        needs_follow_up = sum(
            1
            for c in rows
            if c.stage != CustomerStage.CHURNED
            and (c.last_contact_at is None or c.last_contact_at < cutoff)
        )
        return CustomerSummary(
            total=len(rows),
            by_stage=by_stage,
            active=sum(1 for c in rows if c.stage == CustomerStage.ACTIVE),
            churned=sum(1 for c in rows if c.stage == CustomerStage.CHURNED),
            total_mrr=round(sum(c.monthly_value or 0 for c in rows), 2),
            total_ltv=round(sum(c.lifetime_value or 0 for c in rows), 2),
            added_this_month=this_month,
            from_leads=sum(1 for c in rows if c.source == CustomerSource.LEAD),
            needs_follow_up=needs_follow_up,
        )

    # --------------------------------------------------------------- mutate
    async def update(self, customer_id: str, data: CustomerUpdate) -> CustomerResponse:
        c = await self._get(customer_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(c, key, value)
        c.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(c)
        return CustomerResponse.model_validate(c)

    async def delete(self, customer_id: str) -> None:
        c = await self._get(customer_id)
        # detach any lead link
        await self.db.execute(
            delete(Customer).where(
                Customer.id == customer_id, Customer.workspace_id == self.workspace_id
            )
        )
        await self.db.commit()

    async def log_contact(self, customer_id: str, req: LogContactRequest) -> CustomerResponse:
        c = await self._get(customer_id)
        occurred = req.occurred_at or datetime.now(timezone.utc)
        if occurred.tzinfo is None:
            occurred = occurred.replace(tzinfo=timezone.utc)
        direction = req.direction if req.direction in ("in", "out") else None

        self.db.add(
            CustomerInteraction(
                customer_id=c.id,
                kind=req.kind.value,
                direction=direction,
                note=(req.note or "").strip() or None,
                occurred_at=occurred,
                created_by=self.user_id,
                workspace_id=self.workspace_id,
            )
        )
        # Keep the denormalised "last contact" in sync — only move it forward.
        if c.last_contact_at is None or occurred > c.last_contact_at:
            c.last_contact_at = occurred
        c.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(c)
        return CustomerResponse.model_validate(c)

    async def list_interactions(self, customer_id: str) -> List[CustomerInteractionRow]:
        await self._get(customer_id)  # 404s / scopes to workspace
        rows = (
            await self.db.execute(
                select(CustomerInteraction)
                .where(CustomerInteraction.customer_id == customer_id)
                .order_by(desc(CustomerInteraction.occurred_at))
            )
        ).scalars().all()
        return [CustomerInteractionRow.model_validate(r) for r in rows]

    async def delete_interaction(self, customer_id: str, interaction_id: str) -> None:
        c = await self._get(customer_id)
        row = (
            await self.db.execute(
                select(CustomerInteraction).where(
                    CustomerInteraction.id == interaction_id,
                    CustomerInteraction.customer_id == customer_id,
                    CustomerInteraction.workspace_id == self.workspace_id,
                )
            )
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Interaction not found")
        await self.db.delete(row)
        await self.db.flush()
        # Recompute last_contact_at from whatever's left.
        newest = (
            await self.db.execute(
                select(func.max(CustomerInteraction.occurred_at)).where(
                    CustomerInteraction.customer_id == customer_id
                )
            )
        ).scalar()
        c.last_contact_at = newest
        await self.db.commit()

    # -------------------------------------------------------------- private
    async def _get(self, customer_id: str) -> Customer:
        c = await self._get_or_none(customer_id)
        if not c:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
        return c

    async def _get_or_none(self, customer_id: str) -> Optional[Customer]:
        res = await self.db.execute(
            select(Customer).where(
                Customer.id == customer_id, Customer.workspace_id == self.workspace_id
            )
        )
        return res.scalar_one_or_none()
