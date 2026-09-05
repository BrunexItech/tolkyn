from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from datetime import datetime, timezone
from fastapi import HTTPException, status

from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import UserRegister, UserLogin, UserResponse, AuthResponse, TokenResponse
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
)
from app.core.config import settings
from app.core.legal import CURRENT_LEGAL_VERSION


def user_response(user: User) -> UserResponse:
    """Single place the User ORM row is mapped to the API shape — keeps the
    register / login / me / profile-update responses from drifting apart."""
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        avatar=user.avatar,
        phone=user.phone,
        position=user.position,
        bio=user.bio,
        location=user.location,
        website=user.website,
        role=user.role,
        status=user.status,
        is_email_verified=user.is_email_verified,
        is_approved=user.is_approved,
        terms_accepted=(
            user.terms_accepted_at is not None
            and user.terms_version == CURRENT_LEGAL_VERSION
        ),
        terms_version=user.terms_version,
        two_factor_enabled=user.two_factor_enabled,
        workspace_id=user.workspace_id,
        timezone=user.timezone,
        language=user.language,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


class UserService:
    """Service for user authentication and management."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ============================================================
    # Authentication
    # ============================================================
    
    async def register_user(self, data: UserRegister) -> AuthResponse:
        """Register a new user."""
        # Check if user exists
        existing = await self._get_user_by_email(data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )
        
        # Create user. Self-service signup never grants dashboard access by
        # itself — the super admin has to approve the account first (see
        # SuperAdminService.approve_user / core.security.get_current_user_id).
        from app.models.package import Package
        default_pkg = (
            await self.db.execute(select(Package.id).where(Package.is_default.is_(True), Package.is_active.is_(True)))
        ).scalar_one_or_none()
        user = User(
            name=data.name,
            email=data.email,
            password_hash=get_password_hash(data.password),
            role=UserRole.VIEWER,
            status=UserStatus.ACTIVE,
            is_email_verified=False,
            is_approved=False,
            package_id=default_pkg,
        )
        
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        # Send the "confirm your email" message (never blocks / breaks signup).
        try:
            await self.send_verification_email(user.id)
        except Exception:  # pragma: no cover
            pass

        # Generate tokens
        access_token, refresh_token = self._generate_tokens(user.id)

        return AuthResponse(
            user=user_response(user),
            token=TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            )
        )
    
    async def login_user(self, data: UserLogin) -> AuthResponse:
        """Authenticate a user."""
        user = await self._get_user_by_email(data.email)
        if not user or not verify_password(data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Credentials are correct from here on — give a specific reason
        # rather than the generic message, so a legitimate new user knows
        # what's actually happening to their account.
        if not user.is_approved:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is awaiting approval from the platform administrator."
            )
        if user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is suspended. Contact the platform administrator."
            )

        # Update last login
        await self._update_last_login(user.id)
        
        # Generate tokens
        access_token, refresh_token = self._generate_tokens(user.id)
        
        return AuthResponse(
            user=user_response(user),
            token=TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            )
        )
    
    async def refresh_token(self, refresh_token: str) -> TokenResponse:
        """Refresh access token using refresh token."""
        from app.core.security import decode_token, create_access_token
        
        payload = decode_token(refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload"
            )
        
        # Verify user still exists, is active, and is approved
        user = await self._get_user_by_id(user_id)
        if not user or user.status != UserStatus.ACTIVE or not user.is_approved:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found, inactive, or awaiting approval"
            )
        
        access_token = create_access_token({"sub": user_id})
        
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    
    async def logout_user(self, user_id: str) -> None:
        """Logout user (placeholder for token blacklisting)."""
        pass
    
    # ============================================================
    # User Management
    # ============================================================
    
    async def get_user_by_id(self, user_id: str) -> Optional[UserResponse]:
        """Get user by ID."""
        user = await self._get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return user_response(user)

    async def accept_terms(self, user_id: str, ip: Optional[str] = None) -> UserResponse:
        """Record that this user has accepted the current Terms of Service and
        Privacy Policy. The version stored is always the server's own
        CURRENT_LEGAL_VERSION — the client doesn't get to name it."""
        user = await self._get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.terms_accepted_at = datetime.now(timezone.utc)
        user.terms_version = CURRENT_LEGAL_VERSION
        user.terms_accepted_ip = ip
        user.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(user)
        return user_response(user)

    async def update_user_profile(self, user_id: str, data: Dict[str, Any]) -> UserResponse:
        """Update user profile."""
        user = await self._get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Allowed fields to update
        allowed_fields = {"name", "phone", "position", "bio", "location", "website", "timezone", "language"}
        
        for field, value in data.items():
            if field in allowed_fields and value is not None:
                setattr(user, field, value)
        
        user.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(user)
        
        return user_response(user)
    
    async def change_password(self, user_id: str, current_password: str, new_password: str) -> bool:
        """Change user password."""
        user = await self._get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        user.password_hash = get_password_hash(new_password)
        user.password_changed_at = datetime.now(timezone.utc)
        user.updated_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        return True
    
    async def delete_user(self, user_id: str) -> bool:
        """Soft delete a user."""
        user = await self._get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user.is_deleted = True
        user.deleted_at = datetime.now(timezone.utc)
        user.status = UserStatus.INACTIVE
        
        await self.db.commit()
        return True
    
    # ============================================================
    # Email Verification  &  Password Reset  (token table backed)
    # ============================================================

    async def _issue_token(self, user_id: str, kind, ttl_minutes: int, ip: Optional[str] = None) -> str:
        """Create a single-use token row and return the RAW token (only its
        SHA-256 hash is stored). Any earlier unused token of the same kind for
        this user is invalidated first."""
        import hashlib
        import secrets as _secrets
        from datetime import timedelta

        from app.models.auth_token import AuthToken

        await self.db.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user_id,
                AuthToken.kind == kind,
                AuthToken.used_at.is_(None),
            )
            .values(used_at=datetime.now(timezone.utc))
        )
        raw = _secrets.token_urlsafe(32)
        self.db.add(
            AuthToken(
                user_id=user_id,
                kind=kind,
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
                requested_ip=ip,
            )
        )
        await self.db.commit()
        return raw

    async def _consume_token(self, raw: str, kind):
        """Validate a raw token; return (AuthToken, User) or raise 400."""
        import hashlib

        from app.models.auth_token import AuthToken

        digest = hashlib.sha256((raw or "").encode()).hexdigest()
        row = (
            await self.db.execute(
                select(AuthToken).where(AuthToken.token_hash == digest, AuthToken.kind == kind)
            )
        ).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if (
            not row
            or row.used_at is not None
            or (row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at) < now
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This link is invalid or has expired. Please request a new one.",
            )
        user = await self._get_user_by_id(row.user_id)
        if not user or user.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account no longer exists.")
        return row, user

    async def send_verification_email(self, user_id: str) -> None:
        from app.models.auth_token import AuthTokenKind
        from app.services import platform_mailer

        user = await self._get_user_by_id(user_id)
        if not user or user.is_email_verified:
            return
        raw = await self._issue_token(user_id, AuthTokenKind.EMAIL_VERIFY, ttl_minutes=60 * 24)
        link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={raw}"
        try:
            await platform_mailer.send_branded(
                user.email,
                "Confirm your email · Tolkyn",
                heading="Confirm your email address",
                body_lines=[
                    f"Hi {user.name.split(' ')[0] if user.name else 'there'},",
                    "Please confirm this is your email address so we can keep your Tolkyn account secure.",
                ],
                button_label="Confirm email",
                button_url=link,
                footnote="This link expires in 24 hours.",
            )
        except Exception as exc:  # pragma: no cover - email must never break signup
            import logging

            logging.getLogger("tolkyn.mailer").error("verification email failed: %s", exc)

    async def verify_email(self, token: str) -> bool:
        from app.models.auth_token import AuthTokenKind

        row, user = await self._consume_token(token, AuthTokenKind.EMAIL_VERIFY)
        user.is_email_verified = True
        user.email_verified_at = datetime.now(timezone.utc)
        row.used_at = datetime.now(timezone.utc)
        await self.db.commit()
        return True

    async def initiate_password_reset(self, email: str, ip: Optional[str] = None) -> None:
        """Always returns None (no account enumeration). Sends a reset link
        only if an active account matches."""
        from app.models.auth_token import AuthTokenKind
        from app.services import platform_mailer

        user = await self._get_active_user_by_email(email)
        if not user:
            return
        raw = await self._issue_token(user.id, AuthTokenKind.PASSWORD_RESET, ttl_minutes=60, ip=ip)
        link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw}"
        try:
            await platform_mailer.send_branded(
                user.email,
                "Reset your Tolkyn password",
                heading="Reset your password",
                body_lines=[
                    f"Hi {user.name.split(' ')[0] if user.name else 'there'},",
                    "We received a request to reset the password on your Tolkyn account. "
                    "Click the button below to choose a new one.",
                ],
                button_label="Reset password",
                button_url=link,
                footnote="This link expires in 1 hour. If you didn't ask for this, no action is needed — "
                "your password stays the same.",
            )
        except Exception as exc:  # pragma: no cover
            import logging

            logging.getLogger("tolkyn.mailer").error("reset email failed: %s", exc)

    async def reset_password(self, token: str, new_password: str) -> bool:
        from app.models.auth_token import AuthToken, AuthTokenKind

        row, user = await self._consume_token(token, AuthTokenKind.PASSWORD_RESET)
        user.password_hash = get_password_hash(new_password)
        user.password_changed_at = datetime.now(timezone.utc)
        row.used_at = datetime.now(timezone.utc)
        # burn every other outstanding reset token for this user
        await self.db.execute(
            update(AuthToken)
            .where(
                AuthToken.user_id == user.id,
                AuthToken.kind == AuthTokenKind.PASSWORD_RESET,
                AuthToken.used_at.is_(None),
            )
            .values(used_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
        return True
    
    # ============================================================
    # Private Methods
    # ============================================================
    
    async def _get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID (internal)."""
        query = select(User).where(
            User.id == user_id,
            User.is_deleted == False
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def _get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email (internal)."""
        query = select(User).where(User.email == email, User.is_deleted == False)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def _get_active_user_by_email(self, email: str) -> Optional[User]:
        """Get active user by email (internal)."""
        query = select(User).where(
            User.email == email,
            User.status == UserStatus.ACTIVE,
            User.is_deleted == False
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def _update_last_login(self, user_id: str) -> None:
        """Update user's last login timestamp."""
        query = update(User).where(User.id == user_id).values(
            last_login_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        await self.db.execute(query)
        await self.db.commit()
    
    def _generate_tokens(self, user_id: str) -> tuple[str, str]:
        """Generate access and refresh tokens."""
        access_token = create_access_token({"sub": user_id})
        refresh_token = create_refresh_token({"sub": user_id})
        return access_token, refresh_token