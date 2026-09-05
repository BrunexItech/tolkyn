"""Response headers every reply gets, regardless of route. None of this is
secret-dependent — it's the standard baseline (clickjacking, MIME-sniffing,
referrer leakage, forced-HTTPS) that costs nothing to apply everywhere."""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # Only meaningful once you're actually served over HTTPS — harmless
        # to send in dev, but only *effective* in production behind TLS.
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response
