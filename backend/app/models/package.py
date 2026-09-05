from sqlalchemy import Boolean, Column, Float, Integer, JSON, String, Text

from app.db.base import BaseModel


class Package(BaseModel):
    """A pricing tier the super admin defines. Assigning one to a user
    (User.package_id) sets which platform modules that user's whole workspace
    can reach. `modules == ["*"]` means everything."""

    __tablename__ = "packages"

    name = Column(String(80), nullable=False, unique=True)
    description = Column(Text, nullable=True)

    price_amount = Column(Float, nullable=False, default=0)
    price_currency = Column(String(8), nullable=False, default="KES")
    price_interval = Column(String(12), nullable=False, default="month")  # month | year | once

    modules = Column(JSON, nullable=False, default=list)   # list[str] of app.core.features keys, or ["*"]
    limits = Column(JSON, nullable=False, default=dict)    # {seats, video_budget_usd, sms_monthly, call_minutes_monthly}

    is_active = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)  # auto-assigned to new signups
    sort_order = Column(Integer, nullable=False, default=0)
