from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db import get_db
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    RefreshTokenRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    AuthResponse,
    TokenResponse,
    MessageResponse,
    UserResponse,
)
from app.services.user_service import UserService
from app.core.security import get_current_user_id

router = APIRouter()


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user"
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def register(
    request: Request,
    data: UserRegister,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Register a new user account.

    - **name**: Full name (2-255 characters)
    - **email**: Valid email address
    - **password**: Minimum 8 characters with uppercase, lowercase, and number
    - **password_confirm**: Must match password
    """
    service = UserService(db)
    return await service.register_user(data)


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Login user"
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def login(
    request: Request,
    data: UserLogin,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Authenticate user and return tokens.

    - **email**: Registered email address
    - **password**: Account password
    - **remember_me**: Extend session duration
    """
    service = UserService(db)
    return await service.login_user(data)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token"
)
async def refresh_token(
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get a new access token using a refresh token.
    
    - **refresh_token**: Valid refresh token from login
    """
    service = UserService(db)
    return await service.refresh_token(data.refresh_token)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Logout user"
)
async def logout(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Logout current user (invalidates session).
    """
    service = UserService(db)
    await service.logout_user(user_id)
    return MessageResponse(message="Successfully logged out")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile"
)
async def get_me(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get the current authenticated user's profile.
    """
    service = UserService(db)
    return await service.get_user_by_id(user_id)


@router.post(
    "/accept-terms",
    response_model=UserResponse,
    summary="Record acceptance of the current Terms of Service & Privacy Policy",
)
async def accept_terms(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Called from the frontend TermsGate when the user ticks the box and
    continues. Stores the timestamp, the server's current legal version, and
    the caller's IP for the audit trail."""
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else None
    )
    return await UserService(db).accept_terms(user_id, ip=ip)


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile"
)
async def update_me(
    data: dict,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Update the current user's profile.
    
    Allowed fields: name, phone, position, bio, location, website, timezone, language
    """
    service = UserService(db)
    return await service.update_user_profile(user_id, data)


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change user password"
)
async def change_password(
    data: ChangePasswordRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Change user password.
    
    - **current_password**: Current password
    - **new_password**: New password (min 8 chars)
    - **new_password_confirm**: Must match new_password
    """
    service = UserService(db)
    await service.change_password(
        user_id,
        data.current_password,
        data.new_password
    )
    return MessageResponse(message="Password changed successfully")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset"
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Request a password reset email.
    
    - **email**: Registered email address
    """
    service = UserService(db)
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else None
    )
    await service.initiate_password_reset(data.email, ip=ip)
    return MessageResponse(
        message="If an account exists with this email, a reset link has been sent"
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password"
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def reset_password(
    request: Request,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Reset password using token from email.
    
    - **token**: Reset token from email
    - **new_password**: New password (min 8 chars)
    - **new_password_confirm**: Must match new_password
    """
    service = UserService(db)
    await service.reset_password(data.token, data.new_password)
    return MessageResponse(message="Password reset successfully")


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Confirm an email address from the link we sent",
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def verify_email(
    request: Request,
    data: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    await UserService(db).verify_email(data.token)
    return MessageResponse(message="Email confirmed. Thank you!")


@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    summary="Send a fresh email-verification link",
)
@limiter.limit(settings.RATE_LIMIT_AUTH)
async def resend_verification(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Any:
    await UserService(db).send_verification_email(user_id)
    return MessageResponse(message="If your email still needs confirming, a new link is on its way.")


@router.delete(
    "/me",
    response_model=MessageResponse,
    summary="Delete user account"
)
async def delete_me(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Permanently delete the current user's account.
    """
    service = UserService(db)
    await service.delete_user(user_id)
    return MessageResponse(message="Account deleted successfully")