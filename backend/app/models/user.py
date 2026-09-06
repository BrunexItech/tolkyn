from sqlalchemy import Column, String, Boolean, DateTime, Enum, Text, Integer, JSON, Float, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import BaseModel


class UserRole(str, enum.Enum):
    """User roles for role-based access control."""
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    EDITOR = "editor"
    VIEWER = "viewer"
    CONTRIBUTOR = "contributor"


class UserStatus(str, enum.Enum):
    """User account status."""
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class User(BaseModel):
    """User model for authentication and authorization."""
    
    __tablename__ = "users"
    
    # Basic Info
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    
    # Profile
    avatar = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    position = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    website = Column(String(500), nullable=True)
    
    # Account Status
    role = Column(Enum(UserRole), default=UserRole.VIEWER, nullable=False)
    status = Column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)

    # Gate on self-service signup: a freshly registered user cannot reach the
    # dashboard until the super admin approves them. Existing rows default to
    # True (the column backfills as True on ALTER, see db/base.py) so nobody
    # who already had access loses it; only NEW registrations set this False.
    is_approved = Column(Boolean, default=True, nullable=False)

    # Video generation governance (super admin controlled). Empty list on
    # allowed_video_models means "no restriction — every model is usable".
    # video_budget_usd of None means "no spending cap".
    allowed_video_models = Column(JSON, default=list, nullable=False)
    video_budget_usd = Column(Float, nullable=True)

    # Per-day generation caps (super admin controlled). NULL = fall back to the
    # workspace package's limits ({"images_daily", "videos_daily"}); if the
    # package has none either, generation is unlimited. Counts reset at UTC
    # midnight. See app.core.limits.
    daily_image_limit = Column(Integer, nullable=True)
    daily_video_limit = Column(Integer, nullable=True)

    # Per-module access overrides on top of the package. {"crm": true} force-
    # grants a module the package doesn't include; {"video": false} removes one
    # it does. Everything else follows the package. See app.core.actor.
    module_overrides = Column(JSON, default=dict, nullable=False)

    # Persistent brand identity for AI Video — set once, applied automatically
    # to every generation from then on (color hints in the prompt + a
    # corner watermark composited onto the finished clip).
    brand_logo_url = Column(String(500), nullable=True)
    brand_colors = Column(JSON, nullable=True)
    
    # Verification
    is_email_verified = Column(Boolean, default=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    
    # Security
    two_factor_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String(255), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(50), nullable=True)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Workspace
    workspace_id = Column(String(36), nullable=True, index=True)

    # Pricing package (super-admin assigned). NULL = grandfathered to full
    # access — see app.core.actor.get_actor / app.core.features.
    package_id = Column(String(36), ForeignKey("packages.id"), nullable=True, index=True)
    package = relationship("Package", foreign_keys=[package_id], lazy="selectin")
    
    # Settings
    preferences = Column(JSON, default={}, nullable=False)
    timezone = Column(String(50), default="UTC")
    language = Column(String(10), default="en")

    # Legal — records acceptance of the Terms of Service + Privacy Policy.
    # `terms_version` is the app.core.legal.CURRENT_LEGAL_VERSION the user
    # accepted; if it no longer matches, they must re-accept before continuing.
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    terms_version = Column(String(20), nullable=True)
    terms_accepted_ip = Column(String(50), nullable=True)

    # Deletion
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self) -> str:
        return f"<User {self.email}>"