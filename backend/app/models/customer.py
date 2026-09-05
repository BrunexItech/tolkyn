from sqlalchemy import Column, String, DateTime, Float, Text, JSON, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
import enum
from app.db.base import BaseModel


class CustomerStage(str, enum.Enum):
    """Where the customer sits in the lifecycle."""
    LEAD = "lead"
    PROSPECT = "prospect"
    TRIAL = "trial"
    ACTIVE = "active"
    CHURNED = "churned"


class CustomerStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


class CustomerSource(str, enum.Enum):
    LEAD = "lead"          # converted from a generated / captured lead
    MANUAL = "manual"      # added by hand in the CRM
    IMPORT = "import"
    REFERRAL = "referral"
    SOCIAL = "social"      # converted from a social comment / DM lead


class Customer(BaseModel):
    """A customer / account tracked in the CRM."""

    __tablename__ = "customers"

    # Identity
    name = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    company = Column(String(255), nullable=True, index=True)
    position = Column(String(255), nullable=True)
    website_url = Column(String(500), nullable=True)

    # Location
    location = Column(String(255), nullable=True)
    country = Column(String(100), nullable=True)

    # Social
    linkedin_url = Column(String(500), nullable=True)
    instagram_handle = Column(String(255), nullable=True)
    twitter_handle = Column(String(255), nullable=True)

    # Lifecycle
    stage = Column(Enum(CustomerStage), nullable=False, default=CustomerStage.PROSPECT)
    status = Column(Enum(CustomerStatus), nullable=False, default=CustomerStatus.ACTIVE)
    source = Column(Enum(CustomerSource), nullable=False, default=CustomerSource.MANUAL)

    # Value
    lifetime_value = Column(Float, nullable=True)          # total historical value
    monthly_value = Column(Float, nullable=True)           # MRR
    currency = Column(String(8), nullable=False, default="USD")

    # Engagement
    last_contact_at = Column(DateTime(timezone=True), nullable=True)
    next_action = Column(String(255), nullable=True)
    next_action_at = Column(DateTime(timezone=True), nullable=True)

    # Meta
    tags = Column(JSON, default=list, nullable=False)
    notes = Column(Text, nullable=True)
    custom_fields = Column(JSON, default=dict, nullable=False)

    # AI (carried over from the lead, if any)
    ai_summary = Column(Text, nullable=True)
    ai_recommendation = Column(Text, nullable=True)

    # Ownership / tenancy
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    # Link back to the originating lead
    lead_id = Column(String(36), nullable=True, index=True)

    owner = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (
        Index("ix_customers_workspace_stage", "workspace_id", "stage"),
        Index("ix_customers_workspace_created", "workspace_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Customer {self.name} | {self.company} | {self.stage}>"
