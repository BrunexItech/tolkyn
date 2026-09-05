from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
)
import enum

from app.db.base import BaseModel


class SocialLeadIntent(str, enum.Enum):
    """How ready-to-buy the person sounds."""
    HOT = "hot"        # explicit buying signal — asked price, wants to order, "how do I buy"
    WARM = "warm"      # real interest — asking questions about a product / availability
    COLD = "cold"      # mild interest — vague praise, "looks nice", following along
    NONE = "none"      # not a lead — spam, unrelated, a complaint, generic comment


class SocialLeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    CONVERTED = "converted"
    DISMISSED = "dismissed"


class SocialLead(BaseModel):
    """A person who commented / messaged on a connected social account and was
    classified by AI as a potential lead for a product or service."""

    __tablename__ = "social_leads"

    # where it came from
    platform = Column(String(30), nullable=False, index=True)
    kind = Column(String(16), nullable=False, default="comment")  # comment | dm | mention
    author_name = Column(String(160), nullable=False)
    author_handle = Column(String(160), nullable=True)
    author_avatar = Column(String(500), nullable=True)

    message = Column(Text, nullable=False)              # the comment / message text
    post_context = Column(String(500), nullable=True)   # caption / what the post was about
    permalink = Column(String(600), nullable=True)

    # --- AI classification ---
    is_lead = Column(Boolean, nullable=False, default=False, index=True)
    product_interest = Column(String(240), nullable=True)   # what they seem to want
    intent = Column(Enum(SocialLeadIntent), nullable=False, default=SocialLeadIntent.NONE)
    buying_signals = Column(JSON, default=list, nullable=False)  # ["asked for price", ...]
    sentiment = Column(String(16), nullable=True)               # positive | neutral | negative
    confidence = Column(Float, nullable=True)                    # 0-100
    ai_summary = Column(Text, nullable=True)
    suggested_reply = Column(Text, nullable=True)
    classified_at = Column(DateTime(timezone=True), nullable=True)
    classifier = Column(String(24), nullable=True)              # "openai" | "heuristic"

    # --- pipeline ---
    status = Column(Enum(SocialLeadStatus), nullable=False, default=SocialLeadStatus.NEW, index=True)

    # --- links ---
    thread_external_id = Column(String(200), nullable=True, index=True)  # stable inbox key
    inbox_thread_id = Column(String(36), nullable=True, index=True)
    converted_customer_id = Column(String(36), nullable=True, index=True)

    detected_at = Column(DateTime(timezone=True), nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    __table_args__ = (
        Index("ix_social_leads_workspace_status", "workspace_id", "status"),
        Index("ix_social_leads_workspace_intent", "workspace_id", "intent"),
        Index("ix_social_leads_workspace_islead", "workspace_id", "is_lead"),
    )

    def __repr__(self) -> str:
        return f"<SocialLead {self.author_name} | {self.platform} | {self.intent}>"
