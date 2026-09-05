"""Auth for service-to-service calls (currently: the whatsapp-worker's
webhooks) that can't carry a user's JWT because there's no logged-in user
making the request — just a shared secret both sides know, set once in
.env and never exposed to any frontend."""
from fastapi import Header, HTTPException, status

from app.core.config import settings


async def verify_internal_secret(x_internal_secret: str = Header(default="")) -> None:
    if not settings.INTERNAL_SHARED_SECRET or x_internal_secret != settings.INTERNAL_SHARED_SECRET:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid internal secret")
