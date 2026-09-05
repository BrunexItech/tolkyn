import math
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign, CampaignObjective, CampaignStatus
from app.models.lead import Lead
from app.models.post import Post
from app.services.analytics_service import _rng
from app.services.geo_service import GeoService, _URBAN_DENSITY


class CampaignService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def list(self) -> List[Campaign]:
        res = await self.db.execute(
            select(Campaign)
            .where(Campaign.workspace_id == self.workspace_id)
            .order_by(Campaign.created_at.desc())
        )
        return list(res.scalars().all())

    async def get(self, campaign_id: str) -> Campaign:
        res = await self.db.execute(
            select(Campaign).where(
                Campaign.id == campaign_id, Campaign.workspace_id == self.workspace_id
            )
        )
        c = res.scalar_one_or_none()
        if not c:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
        return c

    async def create(self, data: Dict[str, Any]) -> Campaign:
        c = Campaign(
            name=data["name"],
            objective=CampaignObjective(data.get("objective", "awareness")),
            status=CampaignStatus(data.get("status", "draft")),
            brief=data.get("brief"),
            channels=data.get("channels", []),
            color=data.get("color"),
            start_at=data.get("start_at"),
            end_at=data.get("end_at"),
            budget=data.get("budget"),
            goal_metric=data.get("goal_metric"),
            goal_target=data.get("goal_target"),
            target_area_ids=data.get("target_area_ids") or [],
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(c)
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def update(self, campaign_id: str, patch: Dict[str, Any]) -> Campaign:
        c = await self.get(campaign_id)
        for k in (
            "name", "brief", "channels", "color", "start_at", "end_at",
            "budget", "goal_metric", "goal_target", "target_area_ids",
        ):
            if k in patch:
                setattr(c, k, patch[k])
        if patch.get("objective"):
            c.objective = CampaignObjective(patch["objective"])
        if patch.get("status"):
            c.status = CampaignStatus(patch["status"])
        c.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(c)
        return c

    async def delete(self, campaign_id: str) -> None:
        c = await self.get(campaign_id)
        await self.db.execute(
            update(Post).where(Post.campaign_id == campaign_id).values(campaign_id=None)
        )
        await self.db.delete(c)
        await self.db.commit()

    async def posts(self, campaign_id: str) -> List[Post]:
        res = await self.db.execute(
            select(Post).where(
                Post.workspace_id == self.workspace_id, Post.campaign_id == campaign_id
            ).order_by(Post.created_at.desc())
        )
        return list(res.scalars().all())

    async def attach_post(self, campaign_id: str, post_id: str, attach: bool) -> None:
        await self.get(campaign_id)
        res = await self.db.execute(
            select(Post).where(Post.id == post_id, Post.workspace_id == self.workspace_id)
        )
        p = res.scalar_one_or_none()
        if not p:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
        p.campaign_id = campaign_id if attach else None
        await self.db.commit()

    async def metrics(self, campaign_id: str) -> Dict[str, Any]:
        c = await self.get(campaign_id)
        posts = await self.posts(campaign_id)
        published = [p for p in posts if p.status.value in ("published", "partial")]

        reach = 0
        engaged = 0
        for p in published:
            r = _rng(self.workspace_id, p.id, "post")
            pr = int(2000 + r.random() * 60000)
            reach += pr
            engaged += int(pr * (0.03 + r.random() * 0.04))

        # leads attributed by campaign name tag
        res = await self.db.execute(
            select(Lead).where(Lead.workspace_id == self.workspace_id)
        )
        tagname = c.name.lower()
        leads = sum(
            1 for l in res.scalars().all()
            if any(tagname in (t or "").lower() for t in (l.tags or []))
        )

        goal_value = {"reach": reach, "engagement": engaged, "leads": leads, "clicks": int(reach * 0.02)}.get(
            c.goal_metric or "reach", reach
        )
        progress = round(goal_value / c.goal_target * 100, 1) if c.goal_target else None

        geo_reach = await self._geo_estimated_reach(c.target_area_ids or [])

        return {
            "posts": len(posts),
            "published": len(published),
            "scheduled": sum(1 for p in posts if p.status.value == "scheduled"),
            "reach": reach,
            "engaged": engaged,
            "engagement_rate": round(engaged / reach * 100, 2) if reach else 0.0,
            "leads": leads,
            "clicks": int(reach * 0.02),
            "goal_value": goal_value,
            "goal_progress": progress,
            "budget_spent": round((c.budget or 0) * min(len(published) / 8, 1), 2),
            "geo_estimated_reach": geo_reach,
        }

    async def area_labels(self, campaigns: List[Campaign]) -> Dict[str, str]:
        """area_id -> label, for every area referenced by any of these campaigns."""
        ids = {i for c in campaigns for i in (c.target_area_ids or [])}
        if not ids:
            return {}
        areas = await GeoService(self.db, self.user_id).list_areas()
        return {a.id: a.label for a in areas if a.id in ids}

    async def _geo_estimated_reach(self, target_area_ids: List[str]) -> "int | None":
        """Audience size within the campaign's tagged Geo Targeting areas —
        same population-density estimate Geo Targeting itself uses, so a
        campaign's number means the same thing as the one on that page
        rather than being a second, inconsistent guess."""
        if not target_area_ids:
            return None
        areas = await GeoService(self.db, self.user_id).list_areas()
        tagged = [a for a in areas if a.id in target_area_ids and a.mode.value == "include"]
        if not tagged:
            return None
        raw = sum(math.pi * (a.radius_km ** 2) * _URBAN_DENSITY for a in tagged)
        return int(raw * 0.4)

    async def summary(self) -> Dict[str, Any]:
        campaigns = await self.list()
        active = [c for c in campaigns if c.status == CampaignStatus.ACTIVE]
        total_reach = 0
        for c in active:
            m = await self.metrics(c.id)
            total_reach += m["reach"]
        return {
            "total": len(campaigns),
            "active": len(active),
            "draft": sum(1 for c in campaigns if c.status == CampaignStatus.DRAFT),
            "completed": sum(1 for c in campaigns if c.status == CampaignStatus.COMPLETED),
            "active_reach": total_reach,
        }
