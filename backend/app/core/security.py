from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
import secrets
import hashlib
import base64

from app.core.config import settings
from app.db.base import get_db as _lazy_get_db

# Password hashing context
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
)

# Security scheme for Bearer tokens
security_scheme = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Create a JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_token_payload(token: str) -> Dict[str, Any]:
    """Get payload from token without raising exception."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return {}


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(_lazy_get_db),
) -> str:
    """Get current user ID from token. Also re-checks the account's live
    approval/status against the DB on every request — a token stays valid
    until it expires, but a super-admin suspension or a still-pending
    approval must take effect immediately, not just at next login."""
    token = credentials.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check token type
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from sqlalchemy import select as _select
    from app.models.user import User, UserStatus

    row = (
        await db.execute(_select(User).where(User.id == user_id, User.is_deleted.is_(False)))
    ).scalar_one_or_none()
    if not row or row.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is suspended. Contact the platform administrator.",
        )
    if not row.is_approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is awaiting approval from the platform administrator.",
        )

    return user_id


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> Optional[str]:
    """Get current user ID if token is present, otherwise None."""
    if not credentials:
        return None
    
    token = credentials.credentials
    payload = get_token_payload(token)
    
    if not payload or payload.get("type") != "access":
        return None
    
    return payload.get("sub")


def generate_verification_token() -> str:
    """Generate a secure email verification token."""
    return secrets.token_urlsafe(32)


def generate_reset_token() -> str:
    """Generate a secure password reset token."""
    return secrets.token_urlsafe(32)


def generate_api_key() -> str:
    """Generate a secure API key."""
    return f"om_{secrets.token_urlsafe(24)}"


def hash_api_key(api_key: str) -> str:
    """Hash an API key for storage."""
    return hashlib.sha256(api_key.encode()).hexdigest()


def verify_api_key(plain_key: str, hashed_key: str) -> bool:
    """Verify an API key against its hash."""
    return hash_api_key(plain_key) == hashed_key


def generate_two_factor_secret() -> str:
    """Generate a secret for two-factor authentication."""
    return base64.b32encode(secrets.token_bytes(20)).decode()