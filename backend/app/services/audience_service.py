from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audience_segment import AudienceSegment
from app.models.customer import Customer
from app.models.lead import Lead
from app.services.analytics_service import AnalyticsService


def _lead_row(l: Lead) -> Dict[str, Any]:
    return {
        "id": l.id, "kind": "lead", "name": l.name, "company": l.company, "email": l.email,
        "country": l.country, "location": l.location, "tags": l.tags or [],
        "meta": (l.score.value if l.score else "unknown"), "source": (l.source.value if l.source else "manual"),
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }


def _customer_row(c: Customer) -> Dict[str, Any]:
    return {
        "id": c.id, "kind": "customer", "name": c.name, "company": c.company, "email": c.email,
        "country": c.country, "location": c.location, "tags": c.tags or [],
        "meta": (c.stage.value if c.stage else "prospect"), "source": (c.source.value if c.source else "manual"),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _match(row: Dict[str, Any], f: Dict[str, Any]) -> bool:
    if f.get("country") and (row.get("country") or "").lower() != f["country"].lower():
        return False
    if f.get("tag") and not any(f["tag"].lower() in (t or "").lower() for t in row["tags"]):
        return False
    if f.get("meta") and row.get("meta") != f["meta"]:
        return False
    if f.get("search"):
        s = f["search"].lower()
        if s not in " ".join(str(row.get(k) or "") for k in ("name", "company", "email")).lower():
            return False
    return True


class AudienceService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def _rows(self, source: str) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        if source in ("leads", "all"):
            res = await self.db.execute(select(Lead).where(Lead.workspace_id == self.workspace_id))
            rows += [_lead_row(l) for l in res.scalars().all()]
        if source in ("customers", "all"):
            res = await self.db.execute(select(Customer).where(Customer.workspace_id == self.workspace_id))
            rows += [_customer_row(c) for c in res.scalars().all()]
        rows.sort(key=lambda r: r["created_at"] or "", reverse=True)
        return rows

    async def contacts(
        self, source: str = "all", filters: Optional[Dict[str, Any]] = None, limit: int = 50, offset: int = 0
    ) -> Dict[str, Any]:
        rows = await self._rows(source)
        f = filters or {}
        filtered = [r for r in rows if _match(r, f)]
        return {"items": filtered[offset : offset + limit], "total": len(filtered)}

    async def overview(self) -> Dict[str, Any]:
        rows = await self._rows("all")
        by_country: Dict[str, int] = {}
        by_source: Dict[str, int] = {}
        for r in rows:
            if r.get("country"):
                by_country[r["country"]] = by_country.get(r["country"], 0) + 1
            by_source[r["source"]] = by_source.get(r["source"], 0) + 1
        analytics = AnalyticsService(self.db, self.user_id)
        followers = await analytics.followers_by_platform()
        by_plat = await analytics.by_platform()
        return {
            "contacts": len(rows),
            "leads": sum(1 for r in rows if r["kind"] == "lead"),
            "customers": sum(1 for r in rows if r["kind"] == "customer"),
            "followers_total": sum(followers.values()),
            "by_platform": by_plat,
            "by_country": sorted(by_country.items(), key=lambda x: -x[1])[:8],
            "by_source": by_source,
        }

    # -------- segments --------
    async def list_segments(self) -> List[AudienceSegment]:
        res = await self.db.execute(
            select(AudienceSegment)
            .where(AudienceSegment.workspace_id == self.workspace_id)
            .order_by(AudienceSegment.created_at.desc())
        )
        return list(res.scalars().all())

    async def create_segment(self, data: Dict[str, Any]) -> AudienceSegment:
        seg = AudienceSegment(
            name=data["name"],
            description=data.get("description"),
            source=data.get("source", "all"),
            filters=data.get("filters", {}),
            color=data.get("color"),
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(seg)
        await self.db.commit()
        await self.db.refresh(seg)
        return seg

    async def delete_segment(self, seg_id: str) -> None:
        res = await self.db.execute(
            select(AudienceSegment).where(
                AudienceSegment.id == seg_id, AudienceSegment.workspace_id == self.workspace_id
            )
        )
        seg = res.scalar_one_or_none()
        if not seg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Segment not found")
        await self.db.delete(seg)
        await self.db.commit()

    async def segment_count(self, seg: AudienceSegment) -> int:
        rows = await self._rows(seg.source)
        return sum(1 for r in rows if _match(r, seg.filters or {}))
