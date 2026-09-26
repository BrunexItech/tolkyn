import re
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, TypeAdapter, ValidationError, field_validator

_EMAIL = TypeAdapter(EmailStr)
MAX_CC_ADDRESSES = 10
_MAX_CC_LEN = 1000  # matches EmailAccount.default_cc's column width


def normalize_cc(value: Optional[str]) -> Optional[str]:
    """One or several addresses separated by commas / semicolons / newlines
    -> a clean, de-duplicated ", "-joined string, or None when blank (which
    is also how an existing Cc gets cleared). A bad address is rejected by
    name rather than silently dropped, so a typo can't quietly mean a
    colleague never gets copied."""
    if value is None:
        return None
    parts = [p.strip() for p in re.split(r"[,;\n]+", str(value)) if p.strip()]
    if not parts:
        return None
    seen: set = set()
    out: List[str] = []
    for part in parts:
        try:
            addr = str(_EMAIL.validate_python(part))
        except ValidationError:
            raise ValueError(f"'{part}' is not a valid email address")
        if addr.lower() not in seen:
            seen.add(addr.lower())
            out.append(addr)
    if len(out) > MAX_CC_ADDRESSES:
        raise ValueError(f"At most {MAX_CC_ADDRESSES} Cc addresses")
    joined = ", ".join(out)
    if len(joined) > _MAX_CC_LEN:
        raise ValueError("Cc list is too long")
    return joined


class EmailAccountType(str, Enum):
    SMTP = "smtp"
    API = "api"


class EmailAccountCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    type: EmailAccountType = EmailAccountType.SMTP
    from_name: str = Field(..., min_length=1, max_length=120)
    from_email: EmailStr
    reply_to: Optional[EmailStr] = None
    default_cc: Optional[str] = None

    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = Field(None, description="Write-only; never returned")
    use_tls: bool = True
    use_ssl: bool = False

    signature: Optional[str] = None
    daily_limit: int = Field(200, ge=1, le=5000)
    is_default: bool = False

    @field_validator("default_cc")
    @classmethod
    def _clean_cc(cls, v: Optional[str]) -> Optional[str]:
        return normalize_cc(v)


class EmailAccountUpdate(BaseModel):
    label: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[EmailStr] = None
    reply_to: Optional[EmailStr] = None
    default_cc: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None  # only updates if provided & non-empty
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    signature: Optional[str] = None
    daily_limit: Optional[int] = Field(None, ge=1, le=5000)
    is_default: Optional[bool] = None

    @field_validator("default_cc")
    @classmethod
    def _clean_cc(cls, v: Optional[str]) -> Optional[str]:
        return normalize_cc(v)


class EmailAccountResponse(BaseModel):
    id: str
    label: str
    type: EmailAccountType
    from_name: str
    from_email: str
    reply_to: Optional[str] = None
    default_cc: Optional[str] = None
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
    subject: Optional[str] = Field(None, description="Overrides the stored draft subject for this send")
    email_body: Optional[str] = Field(None, description="Overrides the stored draft body for this send")


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
