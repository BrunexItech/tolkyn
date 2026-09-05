from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.actor import get_workspace_id
from app.db import get_db
from app.schemas.geo import (
    GeoResult,
    GeoSearchResponse,
    GeoSummary,
    TargetAreaCreate,
    TargetAreaList,
    TargetAreaResponse,
    TargetAreaUpdate,
)
from app.services.geo_service import GeoService, geocode, reverse_geocode

router = APIRouter()


@router.get("/search", response_model=GeoSearchResponse)
async def search_places(
    q: str = Query(..., min_length=2),
    _uid: str = Depends(get_workspace_id),
):
    return GeoSearchResponse(results=await geocode(q))


@router.get("/reverse", response_model=GeoResult)
async def reverse_place(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    _uid: str = Depends(get_workspace_id),
):
    """Resolves a point clicked directly on the map to a place name."""
    result = await reverse_geocode(lat, lng)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Couldn't identify a place at that point")
    return GeoResult(**result)


@router.get("/summary", response_model=GeoSummary)
async def geo_summary(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    return GeoSummary(**await GeoService(db, user_id).summary())


@router.get("/areas", response_model=TargetAreaList)
async def list_areas(
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    items = await GeoService(db, user_id).list_areas()
    return TargetAreaList(items=[TargetAreaResponse.model_validate(a) for a in items])


@router.post("/areas", response_model=TargetAreaResponse, status_code=status.HTTP_201_CREATED)
async def create_area(
    body: TargetAreaCreate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    area = await GeoService(db, user_id).create_area(body.model_dump())
    return TargetAreaResponse.model_validate(area)


@router.patch("/areas/{area_id}", response_model=TargetAreaResponse)
async def update_area(
    area_id: str,
    body: TargetAreaUpdate,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    area = await GeoService(db, user_id).update_area(area_id, body.model_dump(exclude_unset=True))
    return TargetAreaResponse.model_validate(area)


@router.delete("/areas/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(
    area_id: str,
    user_id: str = Depends(get_workspace_id),
    db: AsyncSession = Depends(get_db),
):
    await GeoService(db, user_id).delete_area(area_id)
