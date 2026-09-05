from sqlalchemy import Column, DateTime, String, UniqueConstraint

from app.db.base import BaseModel


class ProviderProfile(BaseModel):
    """Maps an Tolkyn workspace to its external profile on a publishing
    provider (currently Upload-Post). One row per (workspace, provider)."""

    __tablename__ = "provider_profiles"

    provider = Column(String(40), nullable=False, default="upload_post")
    external_username = Column(String(120), nullable=False)
    workspace_id = Column(String(36), nullable=False, index=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("workspace_id", "provider", name="uq_provider_profile_ws"),
    )
