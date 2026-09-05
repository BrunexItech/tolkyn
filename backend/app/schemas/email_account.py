from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class EmailAccountType(str, Enum):
    SMTP = "smtp"
    API = "api"


class EmailAccountCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    type: EmailAccountType = EmailAccountType.SMTP
    from_name: str = Field(..., min_length=1, max_length=120)
    from_email: EmailStr
    reply_to: Optional[EmailStr] = None

    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = Field(None, description="Write-only; never returned")
    use_tls: bool = True
    use_ssl: bool = False

    signature: Optional[str] = None
    daily_limit: int = Field(200, ge=1, le=5000)
    is_default: bool = False


class EmailAccountUpdate(BaseModel):
    label: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[EmailStr] = None
    reply_to: Optional[EmailStr] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None  # only updates if provided & non-empty
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    signature: Optional[str] = None
    daily_limit: Optional[int] = Field(None, ge=1, le=5000)
    is_default: Optional[bool] = None


class EmailAccountResponse(BaseModel):
    id: str
    label: str
    type: EmailAccountType
    from_name: str
    from_email: str
    reply_to: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    use_tls: bool
    use_ssl: bool
    signature: Optional[str] = None
    is_default: bool
    has_password: bool = False
    verified_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    last_error: Optional[str] = None
    daily_limit: int
    sent_today: int
    sent_total: int
    workspace_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmailAccountList(BaseModel):
    items: List[EmailAccountResponse]


class TestEmailRequest(BaseModel):
    to_email: Optional[EmailStr] = Field(None, description="Defaults to the from_email")


class TestEmailResult(BaseModel):
    ok: bool
    message: str


# ── sending outreach ──────────────────────────────────────────────────────
class SendOutreachRequest(BaseModel):
    email_account_id: str
    include_proposal: bool = True


class BulkSendRequest(BaseModel):
    lead_ids: List[str] = Field(..., min_length=1)
    email_account_id: str
    include_proposal: bool = True


class SendResult(BaseModel):
    lead_id: str
    to_email: Optional[str] = None
    status: str  # sent | failed | skipped
    detail: Optional[str] = None


class BulkSendResult(BaseModel):
    sent: int
    failed: int
    skipped: int
    results: List[SendResult]
