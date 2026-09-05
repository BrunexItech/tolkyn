from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class VideoModelInfo(BaseModel):
    key: str
    label: str
    description: str
    max_resolution: str
    price_per_second: Dict[str, Optional[float]]
    supports_audio: bool = True


class VideoModelsResponse(BaseModel):
    models: List[VideoModelInfo]
    budget_usd: Optional[float] = None
    spent_usd: float = 0.0
    configured: bool = Field(..., description="Whether the platform has a Gemini API key set up")
    brand_logo_url: Optional[str] = None
    brand_colors: Optional[List[str]] = None


class VideoGenerateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_key: str
    prompt: str = Field(..., min_length=3, max_length=2000)
    negative_prompt: Optional[str] = Field(None, max_length=1000)
    aspect_ratio: str = Field(default="16:9")
    resolution: str = Field(default="1080p")
    duration_seconds: int = Field(default=8)
    reference_image_url: Optional[str] = None


class BrandUpdateRequest(BaseModel):
    logo_url: str
    colors: List[str] = Field(default_factory=list, max_length=6)


class VideoJobResponse(BaseModel):
    id: str
    model_key: str
    prompt: str
    negative_prompt: Optional[str] = None
    aspect_ratio: str
    resolution: str
    duration_seconds: int
    generate_audio: bool
    reference_image_url: Optional[str] = None
    brand_logo_url: Optional[str] = None
    brand_colors: Optional[List[str]] = None
    status: str
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error_message: Optional[str] = None
    cost_usd: float
    created_at: datetime

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class VideoJobList(BaseModel):
    items: List[VideoJobResponse]


class EnhancePromptRequest(BaseModel):
    idea: str = Field(..., min_length=3, max_length=1000)
    brand_colors: Optional[List[str]] = None


class EnhancePromptResponse(BaseModel):
    prompt: str
