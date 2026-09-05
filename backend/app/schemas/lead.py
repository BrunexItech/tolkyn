from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class LeadSource(str, Enum):
    LINKEDIN = "linkedin"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    WEBSITE = "website"
    EMAIL = "email"
    REFERRAL = "referral"
    MANUAL = "manual"
    SCRAPED = "scraped"


class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"
    UNQUALIFIED = "unqualified"


class LeadScore(str, Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"
    UNKNOWN = "unknown"


class LeadEngagementLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INACTIVE = "inactive"


# Request Schemas
class LeadCreate(BaseModel):
    """Create a new lead."""
    name: str = Field(..., min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    industry: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    facebook_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    website_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    source: LeadSource = LeadSource.MANUAL
    status: LeadStatus = LeadStatus.NEW
    tags: List[str] = []
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    decision_maker: bool = False
    assigned_to: Optional[str] = None


class LeadSearchQuery(BaseModel):
    """Search query for lead discovery."""
    keywords: str = Field(..., description="Keywords to search for")
    ai_context: str = Field(..., description="Natural language context for AI understanding")
    platforms: List[str] = Field(default=["linkedin", "instagram", "facebook", "twitter"], description="Platforms to scrape")
    location: Optional[str] = Field(None, description="Location filter")
    industry: Optional[str] = Field(None, description="Industry filter")
    max_results: int = Field(default=50, description="Maximum results to return")


class LeadGenerateRequest(BaseModel):
    """Generate leads by crawling a website."""
    url: str = Field(..., description="Company / directory website URL to crawl")
    max_pages: int = Field(default=25, ge=1, le=80)
    max_depth: int = Field(default=2, ge=1, le=3)
    enrich: bool = Field(default=True, description="Run AI scoring + enrichment")
    icp_keywords: List[str] = Field(default_factory=list, description="Ideal-customer-profile keywords for scoring")
    save: bool = Field(default=True, description="Persist the discovered leads")

    @field_validator("url")
    @classmethod
    def _clean_url(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("A website URL is required")
        if not v.startswith(("http://", "https://")):
            v = "https://" + v
        return v


class LeadGenerateStats(BaseModel):
    pages_crawled: int
    candidates: int
    unique: int
    enriched: int
    saved: int
    skipped_duplicates: int
    duration_seconds: float


class LeadGenerateResponse(BaseModel):
    success: bool
    url: str
    message: str
    stats: LeadGenerateStats
    leads: List["LeadResponse"] = []


class LeadUpdate(BaseModel):
    """Update an existing lead."""
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    industry: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    facebook_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    website_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    status: Optional[LeadStatus] = None
    score: Optional[LeadScore] = None
    engagement_level: Optional[LeadEngagementLevel] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    estimated_value: Optional[float] = None
    decision_maker: Optional[bool] = None
    assigned_to: Optional[str] = None
    next_follow_up_date: Optional[datetime] = None


class LeadBulkAction(BaseModel):
    """Bulk action on leads."""
    lead_ids: List[str]
    action: str  # "update_status", "assign", "delete", "add_tags"
    data: Dict[str, Any]


# Response Schemas
class LeadResponse(BaseModel):
    """Lead response schema."""
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    industry: Optional[str] = None
    linkedin_url: Optional[str] = None
    instagram_handle: Optional[str] = None
    facebook_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    website_url: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    source: LeadSource
    status: LeadStatus
    score: LeadScore
    engagement_level: LeadEngagementLevel
    ai_confidence_score: Optional[float] = None
    ai_summary: Optional[str] = None
    ai_recommendation: Optional[str] = None
    ai_intent_signals: Optional[List[str]] = None
    engagement_count: int
    last_contact_date: Optional[datetime] = None
    next_follow_up_date: Optional[datetime] = None
    estimated_value: Optional[float] = None
    budget_range: Optional[str] = None
    decision_maker: bool
    tags: List[str]
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_to_name: Optional[str] = None
    workspace_id: str
    converted_customer_id: Optional[str] = None
    converted_at: Optional[datetime] = None
    outreach_angle: Optional[str] = None
    seniority: Optional[str] = None
    key_facts: List[str] = []
    offer: Optional[str] = None
    sender_company: Optional[str] = None
    has_outreach: bool = False
    outreach_subject: Optional[str] = None
    outreach_email: Optional[str] = None
    outreach_proposal: Optional[str] = None
    outreach_generated_at: Optional[datetime] = None
    outreach_sent_at: Optional[datetime] = None
    outreach_sent_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LeadListResponse(BaseModel):
    items: List[LeadResponse]
    total: int
    limit: int
    offset: int


class LeadDiscoverRequest(BaseModel):
    """Find leads from a natural-language description — no URL required."""
    prompt: str = Field(..., min_length=6, description="Describe the leads you want")
    offer: str = Field("", description="What YOUR business offers (used for emails + proposals)")
    from_company: str = Field("", description="Your business name (the sender)")
    from_website: str = Field("", description="Your business website")
    max_results: int = Field(default=12, ge=1, le=25)
    target_area_ids: List[str] = Field(
        default_factory=list, description="Saved Geo Targeting areas to scope this search to"
    )

    @field_validator("prompt")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 6:
            raise ValueError("Describe what you're looking for in a bit more detail")
        return v


class LeadDiscoverStats(BaseModel):
    sites_scanned: int
    companies_found: int
    qualified: int
    saved: int
    skipped_duplicates: int
    duration_seconds: float


class LeadDiscoverResponse(BaseModel):
    success: bool
    prompt: str
    target_profile: str
    message: str
    stats: LeadDiscoverStats
    leads: List[LeadResponse] = []


class LeadOutreachRequest(BaseModel):
    offer: Optional[str] = Field(None, description="Override: what your business offers")
    from_company: Optional[str] = Field(None, description="Override: your business name")
    from_website: Optional[str] = Field(None, description="Override: your business website")
    tone: str = Field("warm, confident and specific")
    regenerate: bool = Field(default=False)


class LeadOutreach(BaseModel):
    lead_id: str
    subject: str
    email_body: str
    proposal: str
    generated_by: str
    generated_at: datetime


class LeadSummaryResponse(BaseModel):
    """Lead summary for dashboard."""
    total_leads: int
    hot_leads: int
    warm_leads: int
    cold_leads: int
    new_leads: int
    contacted_leads: int
    qualified_leads: int
    closed_won_leads: int
    conversion_rate: float


class LeadSearchResponse(BaseModel):
    """Response from lead search."""
    query_id: str
    total_found: int
    leads: List[LeadResponse]
    search_metadata: Dict[str, Any]
    processing_time: float


class LeadStatusCount(BaseModel):
    """Status count for analytics."""
    status: str
    count: int


class LeadSourceCount(BaseModel):
    """Source count for analytics."""
    source: str
    count: int