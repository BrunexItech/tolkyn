from sqlalchemy import Column, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class AudienceSegment(BaseModel):
    __tablename__ = "audience_segments"

    name = Column(String(160), nullable=False)
    description = Column(Text, nullable=True)
    source = Column(String(16), nullable=False, default="all")  # leads | customers | all
    filters = Column(JSON, default=dict, nullable=False)         # {country, tag, score, stage, search}
    color = Column(String(16), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
