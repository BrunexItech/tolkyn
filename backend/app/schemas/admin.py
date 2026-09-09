from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field

_SLUG_RE = r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"


# --------------------------------------------------------------------- auth
class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=255)


class AdminInfo(BaseModel):
    id: str
    name: str
    email: str
    last_login_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AdminTokenResponse(BaseModel):
    admin: AdminInfo
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ------------------------------------------------------------ organizations
class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=2, max_length=80, pattern=_SLUG_RE)
    notes: Optional[str] = Field(None, max_length=2000)
    owner_user_id: Optional[str] = Field(None, max_length=36, description="The real, approved account this org is built around")


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)
    owner_user_id: Optional[str] = Field(None, max_length=36)


class SubsidiaryResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    subdomain: str
    status: str
    workspace_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    status: str
    notes: Optional[str] = None
    created_at: datetime
    owner_user_id: Optional[str] = None
    owner_email: Optional[str] = None
    subsidiaries: List[SubsidiaryResponse] = []

    model_config = {"from_attributes": True}


# -------------------------------------------------------------- subsidiary
class SubsidiaryCreate(BaseModel):
    organization_id: str
    name: str = Field(..., min_length=1, max_length=255)
    subdomain: str = Field(..., min_length=2, max_length=63, pattern=_SLUG_RE)
    workspace_id: str = Field(..., min_length=1, max_length=36, description="Must be a real, approved account")
    notes: Optional[str] = Field(None, max_length=2000)


class SubsidiaryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[str] = None
    workspace_id: Optional[str] = Field(None, max_length=36)
    notes: Optional[str] = Field(None, max_length=2000)


# ------------------------------------------------------------------- users
class PlatformUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    status: str
    workspace_id: Optional[str] = None
    is_email_verified: bool
    is_approved: bool
    allowed_video_models: List[str] = []
    allowed_video_durations: List[int] = []
    video_budget_usd: Optional[float] = None
    daily_image_limit: Optional[int] = None
    daily_video_limit: Optional[int] = None
    module_overrides: Dict[str, bool] = {}
    package_id: Optional[str] = None
    package_name: Optional[str] = None
    # effective daily caps after package + override merge (None = unlimited)
    effective_image_limit: Optional[int] = None
    effective_video_limit: Optional[int] = None
    images_today: int = 0
    videos_today: int = 0
    last_login_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformUserList(BaseModel):
    items: List[PlatformUserResponse]
    total: int
    limit: int
    offset: int


class PlatformUserUpdate(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None
    is_approved: Optional[bool] = None
    allowed_video_models: Optional[List[str]] = None
    allowed_video_durations: Optional[List[int]] = None  # clip lengths the user may pick; [] = platform default
    video_budget_usd: Optional[float] = None
    daily_image_limit: Optional[int] = None  # null = inherit package; 0 = blocked
    daily_video_limit: Optional[int] = None
    module_overrides: Optional[Dict[str, bool]] = None  # {module: grant?}
    package_id: Optional[str] = None  # "" or null to clear (grandfathered to full access)


class PackageResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    price_amount: float
    price_currency: str
    price_interval: str
    modules: List[str] = []
    limits: Dict[str, Any] = {}
    is_active: bool
    is_default: bool
    sort_order: int
    member_count: int = 0

    model_config = {"from_attributes": True}


class PackageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None
    price_amount: float = 0
    price_currency: str = "KES"
    price_interval: str = "month"
    modules: List[str] = []
    limits: Dict[str, Any] = {}
    is_active: bool = True
    is_default: bool = False
    sort_order: int = 0


class PackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_amount: Optional[float] = None
    price_currency: Optional[str] = None
    price_interval: Optional[str] = None
    modules: Optional[List[str]] = None
    limits: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class ModuleInfo(BaseModel):
    key: str
    label: str


class PackageList(BaseModel):
    items: List[PackageResponse]
    modules: List[ModuleInfo]


class AnnouncementAudience(BaseModel):
    user_ids: Optional[List[str]] = None
    package_id: Optional[str] = None
    status: Optional[str] = None
    approval: Optional[str] = None  # approved | pending
    verified: Optional[bool] = None


class AnnouncementPreview(BaseModel):
    count: int
    audience: str
    sample: List[str] = []


class SendAnnouncementRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    audience: AnnouncementAudience = AnnouncementAudience()


class AnnouncementRow(BaseModel):
    id: str
    subject: str
    audience: Optional[str] = None
    total: int
    sent: int
    failed: int
    created_at: datetime
    errors: List[str] = []


class TelephonyConfigResponse(BaseModel):
    workspace_id: str
    provider: str
    is_active: bool
    pbx_base_url: Optional[str] = None
    api_client_id: Optional[str] = None
    api_client_secret_set: bool = False  # never return the secret itself
    sip_domain: Optional[str] = None
    sip_ws_url: Optional[str] = None
    outbound_caller_id: Optional[str] = None
    record_calls: bool = True
    webhook_secret: Optional[str] = None
    webhook_url: Optional[str] = None  # computed: where the PBX should POST events


class TelephonyConfigUpdate(BaseModel):
    provider: Optional[str] = None  # simulated | cloudone | asterisk
    is_active: Optional[bool] = None
    pbx_base_url: Optional[str] = None
    api_client_id: Optional[str] = None
    api_client_secret: Optional[str] = None  # write-only; "" clears
    sip_domain: Optional[str] = None
    sip_ws_url: Optional[str] = None
    outbound_caller_id: Optional[str] = None
    record_calls: Optional[bool] = None


class UserUsageSummary(BaseModel):
    user_id: str
    leads: int
    customers: int
    posts_published: int
    broadcasts_sent: int
    automations: int
    connected_accounts: int
    video_jobs: int = 0
    video_seconds_generated: int = 0
    video_spend_usd: float = 0.0
    last_login_at: Optional[datetime] = None
    member_since: datetime


# --------------------------------------------------------------- video usage
class VideoUsageRow(BaseModel):
    user_id: str
    name: str
    email: str
    jobs_count: int
    seconds_generated: int
    spend_usd: float
    budget_usd: Optional[float] = None
    allowed_video_models: List[str] = []


class VideoUsageList(BaseModel):
    items: List[VideoUsageRow]


# ---------------------------------------------------------------- activity
class ActivityLogRow(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    workspace_id: Optional[str] = None
    method: str
    path: str
    action: Optional[str] = None
    detail: Optional[Dict[str, Any]] = None
    status_code: Optional[int] = None
    duration_ms: Optional[int] = None
    ip_address: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityLogList(BaseModel):
    items: List[ActivityLogRow]
    total: int
    limit: int
    offset: int


class PlatformOverview(BaseModel):
    organizations: int
    subsidiaries: int
    users: int
    active_users_7d: int
    requests_today: int
    requests_7d: int
    video_jobs_total: int = 0
    video_spend_usd_total: float = 0.0
