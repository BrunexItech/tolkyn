from sqlalchemy import Column, String, DateTime, Integer, Float, Boolean, Enum, Text, JSON, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.db.base import BaseModel


class LeadSource(str, enum.Enum):
    """Source of the lead."""
    LINKEDIN = "linkedin"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    WEBSITE = "website"
    EMAIL = "email"
    REFERRAL = "referral"
    MANUAL = "manual"
    SCRAPED = "scraped"


class LeadStatus(str, enum.Enum):
    """Lead status in the pipeline."""
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATION = "negotiation"
    CLOSED_WON = "closed_won"
    CLOSED_LOST = "closed_lost"
    UNQUALIFIED = "unqualified"


class LeadScore(str, enum.Enum):
    """Lead scoring based on AI analysis."""
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"
    UNKNOWN = "unknown"


class LeadEngagementLevel(str, enum.Enum):
    """Engagement level based on activity."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INACTIVE = "inactive"


class Lead(BaseModel):
    """Lead model for storing prospect information."""
    
    __tablename__ = "leads"
    
    # Basic Information
    name = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    company = Column(String(255), nullable=True, index=True)
    position = Column(String(255), nullable=True)
    industry = Column(String(255), nullable=True)
    
    # Social Profiles
    linkedin_url = Column(String(500), nullable=True)
    instagram_handle = Column(String(255), nullable=True)
    facebook_url = Column(String(500), nullable=True)
    twitter_handle = Column(String(255), nullable=True)
    website_url = Column(String(500), nullable=True)
    
    # Location
    location = Column(String(255), nullable=True)
    country = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    
    # Lead Classification
    source = Column(Enum(LeadSource), nullable=False, default=LeadSource.MANUAL)
    status = Column(Enum(LeadStatus), nullable=False, default=LeadStatus.NEW)
    score = Column(Enum(LeadScore), nullable=False, default=LeadScore.UNKNOWN)
    engagement_level = Column(Enum(LeadEngagementLevel), nullable=False, default=LeadEngagementLevel.INACTIVE)
    
    # AI Generated Fields
    ai_confidence_score = Column(Float, nullable=True)  # 0-100
    ai_summary = Column(Text, nullable=True)
    ai_recommendation = Column(Text, nullable=True)
    ai_intent_signals = Column(JSON, nullable=True)  # List of detected intent signals
    ai_processed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Engagement Metrics
    engagement_count = Column(Integer, default=0)
    last_contact_date = Column(DateTime(timezone=True), nullable=True)
    next_follow_up_date = Column(DateTime(timezone=True), nullable=True)
    
    # Lead Value
    estimated_value = Column(Float, nullable=True)
    budget_range = Column(String(50), nullable=True)
    decision_maker = Column(Boolean, default=False)
    
    # Tags & Notes
    tags = Column(JSON, default=list, nullable=False)  # List of tags
    notes = Column(Text, nullable=True)
    custom_fields = Column(JSON, default=dict, nullable=False)
    
    # Owner & Assignment
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    assigned_to = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    
    # Workspace
    workspace_id = Column(String(36), nullable=False, index=True)
    
    # Scraping Metadata
    scraped_from = Column(String(255), nullable=True)
    scraped_at = Column(DateTime(timezone=True), nullable=True)
    source_url = Column(String(500), nullable=True)

    # CRM conversion
    converted_customer_id = Column(String(36), nullable=True, index=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)

    # AI-generated outreach (email + proposal)
    outreach_subject = Column(String(255), nullable=True)
    outreach_email = Column(Text, nullable=True)
    outreach_proposal = Column(Text, nullable=True)
    outreach_generated_at = Column(DateTime(timezone=True), nullable=True)
    outreach_sent_at = Column(DateTime(timezone=True), nullable=True)
    outreach_sent_count = Column(Integer, nullable=False, default=0)
    
    # Relationships
    owner = relationship("User", foreign_keys=[owner_id])
    assignee = relationship("User", foreign_keys=[assigned_to])
    
    # Indexes for performance
    __table_args__ = (
        Index("ix_leads_workspace_status", "workspace_id", "status"),
        Index("ix_leads_workspace_score", "workspace_id", "score"),
        Index("ix_leads_workspace_created", "workspace_id", "created_at"),
    )
    
    def __repr__(self) -> str:
        return f"<Lead {self.name} | {self.company} | {self.status}>"