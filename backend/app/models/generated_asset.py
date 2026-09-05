from sqlalchemy import Column, Enum, ForeignKey, JSON, String, Text
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class AssetKind(str, enum.Enum):
    COPY = "copy"
    IMAGE = "image"
    VIDEO_PLAN = "video_plan"


class GeneratedAsset(BaseModel):
    """Something the Content Studio produced — reusable in the Composer."""

    __tablename__ = "generated_assets"

    kind = Column(Enum(AssetKind), nullable=False)
    prompt = Column(Text, nullable=False)
    platform = Column(String(40), nullable=True)
    title = Column(String(255), nullable=True)

    payload = Column(JSON, nullable=True)     # variants / video plan
    image_url = Column(String(500), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
