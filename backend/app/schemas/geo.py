from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class TargetMode(str, Enum):
    INCLUDE = "include"
    EXCLUDE = "exclude"


class GeoResult(BaseModel):
    label: str
    display_name: str
    lat: float
    lng: float
    country: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    place_type: Optional[str] = None
    osm_id: Optional[str] = None


class GeoSearchResponse(BaseModel):
    results: List[GeoResult]


class TargetAreaCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=200)
    display_name: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    place_type: Optional[str] = None
    lat: float
    lng: float
    radius_km: int = Field(25, ge=1, le=2000)
    mode: TargetMode = TargetMode.INCLUDE
    osm_id: Optional[str] = None


class TargetAreaUpdate(BaseModel):
    label: Optional[str] = None
    radius_km: Optional[int] = Field(None, ge=1, le=2000)
    mode: Optional[TargetMode] = None


class TargetAreaResponse(BaseModel):
    id: str
    label: str
    display_name: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    place_type: Optional[str] = None
    lat: float
    lng: float
    radius_km: int
    mode: TargetMode
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TargetAreaList(BaseModel):
    items: List[TargetAreaResponse]


class GeoSummary(BaseModel):
    areas: int
    includes: int
    excludes: int
    countries: List[str]
    estimated_reach: int
    matched_contacts: int
    provider: str
