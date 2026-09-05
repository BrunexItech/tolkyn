from sqlalchemy import JSON, Column, Integer, String

from app.db.base import BaseModel


class ActivityLog(BaseModel):
    """One row per authenticated API call. Written by the activity-logging
    middleware (app/core/activity_middleware.py), read by the super admin
    portal to see what users actually do on the platform — not scoped to a
    single workspace, this is the platform-wide trail."""

    __tablename__ = "activity_logs"

    user_id = Column(String(36), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=True, index=True)
    method = Column(String(8), nullable=False)
    path = Column(String(500), nullable=False)
    action = Column(String(120), nullable=True, index=True)  # friendly label, e.g. "posts.create"
    # Structured context for a named business event, e.g. team.role_change ->
    # {"member_id": "...", "from_role": "editor", "to_role": "admin"}. Set via
    # app.core.activity_context.note_activity(); null for generic URL-derived rows.
    detail = Column(JSON, nullable=True)
    status_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(400), nullable=True)

    def __repr__(self) -> str:
        return f"<ActivityLog {self.method} {self.path} ({self.status_code})>"
