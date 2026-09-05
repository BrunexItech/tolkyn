from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class CampaignObjective(str, enum.Enum):
    AWARENESS = "awareness"
    ENGAGEMENT = "engagement"
    LEADS = "leads"
    TRAFFIC = "traffic"
    SALES = "sales"


class CampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class Campaign(BaseModel):
    __tablename__ = "campaigns"

    name = Column(String(200), nullable=False)
    objective = Column(Enum(CampaignObjective), nullable=False, default=CampaignObjective.AWARENESS)
    status = Column(Enum(CampaignStatus), nullable=False, default=CampaignStatus.DRAFT)

    brief = Column(Text, nullable=True)
    channels = Column(JSON, default=list, nullable=False)   # ["instagram","x"]
    color = Column(String(16), nullable=True)

    start_at = Column(DateTime(timezone=True), nullable=True)
    end_at = Column(DateTime(timezone=True), nullable=True)

    budget = Column(Float, nullable=True)
    goal_metric = Column(String(40), nullable=True)   # reach | engagement | leads | clicks
    goal_target = Column(Float, nullable=True)

    target_area_ids = Column(JSON, default=list, nullable=False)  # Geo Targeting area ids

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
