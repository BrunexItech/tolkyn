"""
Geo targeting: geocoding + saved target areas.

Geocoding uses Geoapify when GEOAPIFY_API_KEY is set, otherwise the keyless
OpenStreetMap / Nominatim endpoint. Map tiles on the frontend are keyless
(Esri Dark Gray Canvas).
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.target_area import TargetArea, TargetMode
from app.models.lead import Lead
from app.models.customer import Customer

_UA = "Tolkyn/1.0 (social media management; +https://tolkyn.co.ke)"
_URBAN_DENSITY = 1400  # people / km^2, rough estimate for reach math


def _dedupe_places(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop near-identical hits (same name within ~2 km) — geocoders often return
    a city plus its admin + historic boundaries under one name."""
    out: List[Dict[str, Any]] = []
    for r in rows:
        key = (r.get("label", "").strip().lower(), round(r.get("lat", 0), 2), round(r.get("lng", 0), 2))
        if any(
            key[0] == k[0] and abs(key[1] - k[1]) < 0.03 and abs(key[2] - k[2]) < 0.03
            for k in (
                (o.get("label", "").strip().lower(), round(o.get("lat", 0), 2), round(o.get("lng", 0), 2))
                for o in out
            )
        ):
            continue
        out.append(r)
    return out


async def geocode(query: str, limit: int = 6) -> List[Dict[str, Any]]:
    query = (query or "").strip()
    if len(query) < 2:
        return []
    if settings.GEOAPIFY_API_KEY:
        rows = await _geoapify(query, limit + 4)
    else:
        rows = await _nominatim(query, limit + 4)
    return _dedupe_places(rows)[:limit]


async def reverse_geocode(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    """Resolves a clicked map point to a place name — what lets clicking the
    map itself create a target area, not just picking a search result."""
    if settings.GEOAPIFY_API_KEY:
        row = await _geoapify_reverse(lat, lng)
        if row:
            return row
    return await _nominatim_reverse(lat, lng)


async def _nominatim_reverse(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": _UA}) as c:
            r = await c.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lng, "format": "jsonv2", "addressdetails": 1, "zoom": 10},
            )
            r.raise_for_status()
            item = r.json()
            if not item or item.get("error"):
                return None
            addr = item.get("address", {})
            label = (
                addr.get("city") or addr.get("town") or addr.get("village")
                or addr.get("state") or addr.get("country")
                or item.get("display_name", "").split(",")[0]
            )
            return {
                "label": label,
                "display_name": item.get("display_name", ""),
                "lat": lat,
                "lng": lng,
                "country": addr.get("country"),
                "country_code": (addr.get("country_code") or "").upper() or None,
                "region": addr.get("state") or addr.get("region"),
                "city": addr.get("city") or addr.get("town") or addr.get("village"),
                "place_type": item.get("addresstype") or item.get("type"),
                "osm_id": str(item.get("osm_id") or ""),
            }
    except Exception as exc:  # noqa: BLE001
        print(f"[geo_service] nominatim reverse failed: {exc}")
        return None


async def _geoapify_reverse(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(
                "https://api.geoapify.com/v1/geocode/reverse",
                params={"lat": lat, "lon": lng, "apiKey": settings.GEOAPIFY_API_KEY},
            )
            r.raise_for_status()
            feats = r.json().get("features", [])
            if not feats:
                return None
            p = feats[0].get("properties", {})
            return {
                "label": p.get("city") or p.get("name") or p.get("formatted", "").split(",")[0],
                "display_name": p.get("formatted", ""),
                "lat": lat,
                "lng": lng,
                "country": p.get("country"),
                "country_code": (p.get("country_code") or "").upper() or None,
                "region": p.get("state"),
                "city": p.get("city"),
                "place_type": p.get("result_type"),
                "osm_id": str(p.get("place_id") or ""),
            }
    except Exception as exc:  # noqa: BLE001
        print(f"[geo_service] geoapify reverse failed: {exc}")
        return None


async def _nominatim(query: str, limit: int) -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=12.0, headers={"User-Agent": _UA}) as c:
            r = await c.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "jsonv2", "addressdetails": 1, "limit": limit},
            )
            r.raise_for_status()
            out = []
            for item in r.json():
                addr = item.get("address", {})
                out.append(
                    {
                        "label": item.get("name") or item.get("display_name", "").split(",")[0],
                        "display_name": item.get("display_name", ""),
                        "lat": float(item["lat"]),
                        "lng": float(item["lon"]),
                        "country": addr.get("country"),
                        "country_code": (addr.get("country_code") or "").upper() or None,
                        "region": addr.get("state") or addr.get("region"),
                        "city": addr.get("city") or addr.get("town") or addr.get("village"),
                        "place_type": item.get("addresstype") or item.get("type"),
                        "osm_id": str(item.get("osm_id") or ""),
                    }
                )
            return out
    except Exception as exc:  # noqa: BLE001
        print(f"[geo_service] nominatim failed: {exc}")
        return []


async def _geoapify(query: str, limit: int) -> List[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(
                "https://api.geoapify.com/v1/geocode/autocomplete",
                params={"text": query, "limit": limit, "apiKey": settings.GEOAPIFY_API_KEY},
            )
            r.raise_for_status()
            out = []
            for feat in r.json().get("features", []):
                p = feat.get("properties", {})
                out.append(
                    {
                        "label": p.get("name") or p.get("city") or p.get("formatted", "").split(",")[0],
                        "display_name": p.get("formatted", ""),
                        "lat": p.get("lat"),
                        "lng": p.get("lon"),
                        "country": p.get("country"),
                        "country_code": (p.get("country_code") or "").upper() or None,
                        "region": p.get("state"),
                        "city": p.get("city"),
                        "place_type": p.get("result_type"),
                        "osm_id": str(p.get("place_id") or ""),
                    }
                )
            return out
    except Exception as exc:  # noqa: BLE001
        print(f"[geo_service] geoapify failed: {exc}")
        return await _nominatim(query, limit)


class GeoService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def list_areas(self) -> List[TargetArea]:
        res = await self.db.execute(
            select(TargetArea)
            .where(TargetArea.workspace_id == self.workspace_id)
            .order_by(TargetArea.created_at.desc())
        )
        return list(res.scalars().all())

    async def create_area(self, data: Dict[str, Any]) -> TargetArea:
        area = TargetArea(
            label=data["label"],
            display_name=data.get("display_name"),
            country=data.get("country"),
            country_code=data.get("country_code"),
            region=data.get("region"),
            city=data.get("city"),
            place_type=data.get("place_type"),
            lat=float(data["lat"]),
            lng=float(data["lng"]),
            radius_km=int(data.get("radius_km", 25)),
            mode=TargetMode(data.get("mode", "include")),
            osm_id=data.get("osm_id"),
            owner_id=self.user_id,
            workspace_id=self.workspace_id,
        )
        self.db.add(area)
        await self.db.commit()
        await self.db.refresh(area)
        return area

    async def update_area(self, area_id: str, patch: Dict[str, Any]) -> TargetArea:
        area = await self._get(area_id)
        for k in ("label", "radius_km"):
            if k in patch and patch[k] is not None:
                setattr(area, k, patch[k])
        if patch.get("mode"):
            area.mode = TargetMode(patch["mode"])
        area.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(area)
        return area

    async def delete_area(self, area_id: str) -> None:
        area = await self._get(area_id)
        await self.db.delete(area)
        await self.db.commit()

    async def summary(self) -> Dict[str, Any]:
        areas = await self.list_areas()
        includes = [a for a in areas if a.mode == TargetMode.INCLUDE]
        countries = sorted({a.country for a in areas if a.country})

        # rough reach: circle area * urban density, minus 60% overlap fudge, +/- CRM matches
        raw = sum(math.pi * (a.radius_km ** 2) * _URBAN_DENSITY for a in includes)
        est_reach = int(raw * 0.4)

        # bump with real contacts we hold in those countries
        contact_bonus = 0
        if countries:
            for model in (Lead, Customer):
                res = await self.db.execute(
                    select(model).where(model.workspace_id == self.workspace_id)
                )
                for row in res.scalars().all():
                    if getattr(row, "country", None) in countries:
                        contact_bonus += 1

        return {
            "areas": len(areas),
            "includes": len(includes),
            "excludes": len(areas) - len(includes),
            "countries": countries,
            "estimated_reach": est_reach + contact_bonus,
            "matched_contacts": contact_bonus,
            "provider": "geoapify" if settings.GEOAPIFY_API_KEY else "openstreetmap",
        }

    async def _get(self, area_id: str) -> TargetArea:
        res = await self.db.execute(
            select(TargetArea).where(
                TargetArea.id == area_id, TargetArea.workspace_id == self.workspace_id
            )
        )
        area = res.scalar_one_or_none()
        if not area:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Target area not found")
        return area
