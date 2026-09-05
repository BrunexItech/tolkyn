import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.base import BaseModel


class AutomationTrigger(str, enum.Enum):
    NEW_LEAD = "new_lead"
    NEW_COMMENT = "new_comment"
    NEW_MENTION = "new_mention"
    INBOUND_MESSAGE = "inbound_message"
    POST_PUBLISHED = "post_published"
    SCHEDULE = "schedule"


class AutomationAction(str, enum.Enum):
    SEND_EMAIL = "send_email"
    SEND_SMS = "send_sms"
    ADD_TAG = "add_tag"
    PUSH_TO_CRM = "push_to_crm"
    ASSIGN_TEAMMATE = "assign_teammate"
    AUTO_REPLY = "auto_reply"
    NOTIFY = "notify"


class Automation(BaseModel):
    __tablename__ = "automations"

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    trigger = Column(Enum(AutomationTrigger), nullable=False)
    trigger_config = Column(JSON, default=dict, nullable=False)   # { "platform": "...", "keyword": "..." }

    action = Column(Enum(AutomationAction), nullable=False)
    action_config = Column(JSON, default=dict, nullable=False)    # { "template": "...", "tag": "..." }

    enabled = Column(Boolean, default=True, nullable=False)
    runs_count = Column(Integer, default=0, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)

    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    owner = relationship("User", foreign_keys=[owner_id])
    runs = relationship(
        "AutomationRun", back_populates="automation", cascade="all, delete-orphan", lazy="selectin"
    )


class AutomationRun(BaseModel):
    __tablename__ = "automation_runs"

    automation_id = Column(String(36), ForeignKey("automations.id"), nullable=False, index=True)
    workspace_id = Column(String(36), nullable=False, index=True)

    status = Column(String(20), default="ok", nullable=False)    # ok | skipped | error
    summary = Column(String(400), nullable=True)
    context = Column(JSON, default=dict, nullable=False)

    automation = relationship("Automation", back_populates="runs")
