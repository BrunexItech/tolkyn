import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String

from app.db.base import BaseModel


class AuthTokenKind(str, enum.Enum):
    PASSWORD_RESET = "password_reset"
    EMAIL_VERIFY = "email_verify"


class AuthToken(BaseModel):
    """Single-use, time-limited token for password reset / email verification.

    Only the SHA-256 hash of the token is stored; the raw value lives only in
    the email link. Consumed tokens keep a `used_at` stamp for the audit trail
    rather than being deleted immediately.
    """

    __tablename__ = "auth_tokens"

    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(Enum(AuthTokenKind), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    requested_ip = Column(String(50), nullable=True)
