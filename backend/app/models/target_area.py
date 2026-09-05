from sqlalchemy import Column, Float, Integer, String, Enum, ForeignKey, Index
from sqlalchemy.orm import relationship
import enum

from app.db.base import BaseModel


class TargetMode(str, enum.Enum):
    INCLUDE = "include"
    EXCLUDE = "exclude"


class TargetArea(BaseModel):
    """A saved geographic area used to target posts / campaigns / broadcasts."""

    __tablename__ = "target_areas"

    label = Column(String(200), nullable=False)          # what the user sees
    display_name = Column(String(400), nullable=True)    # full geocoded name

    country = Column(String(120), nullable=True)
    country_code = Column(String(4), nullable=True)
    region = Column(String(160), nullable=True)
    city = Column(String(160), nullable=True)
    place_type = Column(String(60), nullable=True)       # city / region / country / point

    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    radius_km = Column(Integer, nullable=False, default=25)
    mode = Column(Enum(TargetMode), nullable=False, default=TargetMode.INCLUDE)

    osm_id = Column(String(40), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])

    __table_args__ = (Index("ix_target_areas_workspace", "workspace_id", "created_at"),)
