from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AutomationTrigger(str, Enum):
    NEW_LEAD = "new_lead"
    NEW_COMMENT = "new_comment"
    NEW_MENTION = "new_mention"
    INBOUND_MESSAGE = "inbound_message"
    POST_PUBLISHED = "post_published"
    SCHEDULE = "schedule"


class AutomationAction(str, Enum):
    SEND_EMAIL = "send_email"
    SEND_SMS = "send_sms"
    ADD_TAG = "add_tag"
    PUSH_TO_CRM = "push_to_crm"
    ASSIGN_TEAMMATE = "assign_teammate"
    AUTO_REPLY = "auto_reply"
    NOTIFY = "notify"


class AutomationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    trigger: AutomationTrigger
    trigger_config: Dict[str, Any] = {}
    action: AutomationAction
    action_config: Dict[str, Any] = {}
    enabled: bool = True


class AutomationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger: Optional[AutomationTrigger] = None
    trigger_config: Optional[Dict[str, Any]] = None
    action: Optional[AutomationAction] = None
    action_config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None


class AutomationResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    trigger: AutomationTrigger
    trigger_config: Dict[str, Any]
    action: AutomationAction
    action_config: Dict[str, Any]
    enabled: bool
    runs_count: int
    last_run_at: Optional[datetime] = None
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AutomationList(BaseModel):
    items: List[AutomationResponse]


class AutomationRunResponse(BaseModel):
    id: str
    automation_id: str
    status: str
    summary: Optional[str] = None
    context: Dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class AutomationRunList(BaseModel):
    items: List[AutomationRunResponse]


class ToggleRequest(BaseModel):
    enabled: bool


class AutomationSummary(BaseModel):
    total: int
    active: int
    runs_total: int
    triggers: List[Dict[str, Any]]
    actions: List[Dict[str, Any]]
