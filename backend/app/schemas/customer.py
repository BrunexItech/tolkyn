from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class CustomerStage(str, Enum):
    LEAD = "lead"
    PROSPECT = "prospect"
    TRIAL = "trial"
    ACTIVE = "active"
    CHURNED = "churned"


class CustomerStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class CustomerSource(str, Enum):
    LEAD = "lead"
    MANUAL = "manual"
    IMPORT = "import"
    REFERRAL = "referral"
    SOCIAL = "social"


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    website_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    twitter_handle: Optional[str] = None
    stage: CustomerStage = CustomerStage.PROSPECT
    status: CustomerStatus = CustomerStatus.ACTIVE
    source: CustomerSource = CustomerSource.MANUAL
    lifetime_value: Optional[float] = None
    monthly_value: Optional[float] = None
    currency: str = "USD"
    next_action: Optional[str] = None
    next_action_at: Optional[datetime] = None
    tags: List[str] = []
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    website_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    twitter_handle: Optional[str] = None
    stage: Optional[CustomerStage] = None
    status: Optional[CustomerStatus] = None
    lifetime_value: Optional[float] = None
    monthly_value: Optional[float] = None
    currency: Optional[str] = None
    last_contact_at: Optional[datetime] = None
    next_action: Optional[str] = None
    next_action_at: Optional[datetime] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class CustomerResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    website_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    twitter_handle: Optional[str] = None
    stage: CustomerStage
    status: CustomerStatus
    source: CustomerSource
    lifetime_value: Optional[float] = None
    monthly_value: Optional[float] = None
    currency: str
    last_contact_at: Optional[datetime] = None
    next_action: Optional[str] = None
    next_action_at: Optional[datetime] = None
    tags: List[str] = []
    notes: Optional[str] = None
    ai_summary: Optional[str] = None
    ai_recommendation: Optional[str] = None
    owner_id: Optional[str] = None
    workspace_id: str
    lead_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CustomerListResponse(BaseModel):
    items: List[CustomerResponse]
    total: int
    limit: int
    offset: int


class CustomerSummary(BaseModel):
    total: int
    by_stage: Dict[str, int]
    active: int
    churned: int
    total_mrr: float
    total_ltv: float
    added_this_month: int
    from_leads: int
    needs_follow_up: int = 0  # not churned + no contact in FOLLOW_UP_DAYS (or never)


class InteractionKind(str, Enum):
    CALL = "call"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    SMS = "sms"
    MEETING = "meeting"
    NOTE = "note"


class LogContactRequest(BaseModel):
    kind: InteractionKind = InteractionKind.NOTE
    direction: Optional[str] = None  # "in" | "out"
    note: Optional[str] = Field(None, max_length=2000)
    occurred_at: Optional[datetime] = None  # defaults to now on the server


class CustomerInteractionRow(BaseModel):
    id: str
    kind: InteractionKind
    direction: Optional[str] = None
    note: Optional[str] = None
    occurred_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerInteractionList(BaseModel):
    items: List[CustomerInteractionRow]


class ConvertLeadRequest(BaseModel):
    stage: CustomerStage = CustomerStage.PROSPECT
    monthly_value: Optional[float] = None
    lifetime_value: Optional[float] = None
    next_action: Optional[str] = None
