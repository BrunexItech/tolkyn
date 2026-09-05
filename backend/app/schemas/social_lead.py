from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class SocialLeadIntent(str, Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"
    NONE = "none"


class SocialLeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    CONVERTED = "converted"
    DISMISSED = "dismissed"


class SocialLeadResponse(BaseModel):
    id: str
    platform: str
    kind: str
    author_name: str
    author_handle: Optional[str] = None
    author_avatar: Optional[str] = None
    message: str
    post_context: Optional[str] = None
    permalink: Optional[str] = None

    is_lead: bool
    product_interest: Optional[str] = None
    intent: SocialLeadIntent
    buying_signals: List[str] = []
    sentiment: Optional[str] = None
    confidence: Optional[float] = None
    ai_summary: Optional[str] = None
    suggested_reply: Optional[str] = None
    classifier: Optional[str] = None
    classified_at: Optional[datetime] = None

    status: SocialLeadStatus
    thread_external_id: Optional[str] = None
    inbox_thread_id: Optional[str] = None
    converted_customer_id: Optional[str] = None

    detected_at: Optional[datetime] = None
    last_message_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SocialLeadList(BaseModel):
    items: List[SocialLeadResponse]
    total: int
    limit: int
    offset: int


class SocialLeadSummary(BaseModel):
    total: int
    leads: int
    new: int
    hot: int
    warm: int
    cold: int
    converted: int
    dismissed: int
    by_platform: Dict[str, int]
    by_product: List[Dict[str, object]]  # [{name, count}]
    live: bool = False
    ai: bool = False
    last_scan_at: Optional[datetime] = None


class ScanResponse(BaseModel):
    scanned: int
    classified: int
    new_leads: int
    updated: int
    message: str
    ai: bool = False
    live: bool = False


class SocialLeadStatusRequest(BaseModel):
    status: SocialLeadStatus


class SocialLeadReplyRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class ConvertSocialLeadRequest(BaseModel):
    stage: str = "prospect"
    monthly_value: Optional[float] = None
    next_action: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
