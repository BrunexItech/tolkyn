"""Auth for the super-admin (platform control room) — deliberately separate
from app.core.security's tenant auth. Different token `type` claim, different
dependency, so a tenant access token can never be replayed as an admin token
and vice versa."""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

_TOKEN_TYPE = "super_admin"
_admin_scheme = HTTPBearer()


def create_admin_token(super_admin_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.SUPER_ADMIN_TOKEN_EXPIRE_MINUTES)
    payload: Dict[str, Any] = {"sub": super_admin_id, "type": _TOKEN_TYPE, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_super_admin_id(
    credentials: HTTPAuthorizationCredentials = Depends(_admin_scheme),
) -> str:
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("type") != _TOKEN_TYPE or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This token is not a super-admin session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload["sub"]
