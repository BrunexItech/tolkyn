from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CampaignObjective(str, Enum):
    AWARENESS = "awareness"
    ENGAGEMENT = "engagement"
    LEADS = "leads"
    TRAFFIC = "traffic"
    SALES = "sales"


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    objective: CampaignObjective = CampaignObjective.AWARENESS
    status: CampaignStatus = CampaignStatus.DRAFT
    brief: Optional[str] = None
    channels: List[str] = []
    color: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    budget: Optional[float] = None
    goal_metric: Optional[str] = None
    goal_target: Optional[float] = None
    target_area_ids: List[str] = []


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    objective: Optional[CampaignObjective] = None
    status: Optional[CampaignStatus] = None
    brief: Optional[str] = None
    channels: Optional[List[str]] = None
    color: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    budget: Optional[float] = None
    goal_metric: Optional[str] = None
    goal_target: Optional[float] = None
    target_area_ids: Optional[List[str]] = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    objective: CampaignObjective
    status: CampaignStatus
    brief: Optional[str] = None
    channels: List[str]
    color: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    budget: Optional[float] = None
    goal_metric: Optional[str] = None
    goal_target: Optional[float] = None
    target_area_ids: List[str] = []
    target_area_labels: List[str] = []
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CampaignList(BaseModel):
    items: List[CampaignResponse]


class CampaignDetail(CampaignResponse):
    metrics: Dict[str, Any]
    posts: List[Dict[str, Any]]


class AttachPostRequest(BaseModel):
    post_id: str
    attach: bool = True


class CampaignSummary(BaseModel):
    total: int
    active: int
    draft: int
    completed: int
    active_reach: int
