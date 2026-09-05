from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime
from enum import Enum


class UserRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    EDITOR = "editor"
    VIEWER = "viewer"
    CONTRIBUTOR = "contributor"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


# Request Schemas
class UserRegister(BaseModel):
    """User registration request."""
    name: str = Field(..., min_length=2, max_length=255, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, max_length=128, description="Password")
    password_confirm: str = Field(..., description="Confirm password")
    
    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v, info):
        """Validate that password and confirm password match."""
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v
    
    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        """Validate password strength."""
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one number")
        return v


class UserLogin(BaseModel):
    """User login request."""
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., description="Password")
    remember_me: bool = Field(default=False, description="Remember me")


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""
    refresh_token: str = Field(..., description="Refresh token")


class ChangePasswordRequest(BaseModel):
    """Change password request."""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")
    new_password_confirm: str = Field(..., description="Confirm new password")
    
    @field_validator("new_password_confirm")
    @classmethod
    def passwords_match(cls, v, info):
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


class ForgotPasswordRequest(BaseModel):
    """Forgot password request."""
    email: EmailStr = Field(..., description="Email address")


class ResetPasswordRequest(BaseModel):
    """Reset password request."""
    token: str = Field(..., description="Reset token")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")
    new_password_confirm: str = Field(..., description="Confirm new password")
    
    @field_validator("new_password_confirm")
    @classmethod
    def passwords_match(cls, v, info):
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


class VerifyEmailRequest(BaseModel):
    """Email verification request."""
    token: str = Field(..., description="Verification token from the email link")


# Response Schemas
class TokenResponse(BaseModel):
    """Token response."""
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration in seconds")


class UserResponse(BaseModel):
    """User response schema."""
    id: str = Field(..., description="User ID")
    name: str = Field(..., description="Full name")
    email: str = Field(..., description="Email address")
    avatar: Optional[str] = Field(None, description="Avatar URL")
    phone: Optional[str] = Field(None, description="Phone number")
    position: Optional[str] = Field(None, description="Job position")
    bio: Optional[str] = Field(None, description="User bio")
    location: Optional[str] = Field(None, description="Location")
    website: Optional[str] = Field(None, description="Website URL")
    role: UserRole = Field(..., description="User role")
    status: UserStatus = Field(..., description="User status")
    is_email_verified: bool = Field(..., description="Email verification status")
    is_approved: bool = Field(..., description="Whether the super admin has approved dashboard access")
    terms_accepted: bool = Field(default=False, description="Whether the user has accepted the current Terms & Privacy Policy")
    terms_version: Optional[str] = Field(default=None, description="Legal-document version the user last accepted")
    two_factor_enabled: bool = Field(..., description="2FA status")
    workspace_id: Optional[str] = Field(None, description="Workspace ID")
    timezone: str = Field(default="UTC", description="User timezone")
    language: str = Field(default="en", description="User language")
    created_at: datetime = Field(..., description="Account creation date")
    last_login_at: Optional[datetime] = Field(None, description="Last login date")


class AuthResponse(BaseModel):
    """Authentication response."""
    user: UserResponse = Field(..., description="User information")
    token: TokenResponse = Field(..., description="Token information")


class MessageResponse(BaseModel):
    """Generic message response."""
    message: str = Field(..., description="Response message")
    success: bool = Field(default=True, description="Success status")


class ErrorResponse(BaseModel):
    """Error response."""
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
    status_code: int = Field(..., description="HTTP status code")