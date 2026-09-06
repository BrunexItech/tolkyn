from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
import uvicorn
from pathlib import Path
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.activity_middleware import ActivityLoggingMiddleware
from app.core.rate_limit import limiter
from app.core.security_headers import SecurityHeadersMiddleware
from app.api.v1 import router as api_v1_router
from app.db import init_db
from app.services import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"Environment: {settings.APP_ENV}")
    
    # Initialize database
    await init_db()
    print("Database initialized successfully")

    # Background scheduler (publishes due scheduled posts on a timer)
    scheduler.start()

    yield

    # Shutdown
    await scheduler.stop()
    print(f"Shutting down {settings.APP_NAME}")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Tolkyn - All-in-One Social Media Management Platform",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan,
)

# Rate limiting — protects every route from a single client (or a script
# gone wrong) hammering the API hard enough to starve everyone else. See
# app.core.rate_limit for the Redis-shared-across-replicas reasoning.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Baseline security headers on every response (clickjacking, MIME-sniffing,
# referrer leakage, forced-HTTPS in production).
app.add_middleware(SecurityHeadersMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=settings.ALLOWED_METHODS,
    allow_headers=settings.ALLOWED_HEADERS,
)

# Tracks what users actually do — feeds the super-admin activity portal
app.add_middleware(ActivityLoggingMiddleware)

# Trusted Host Middleware — rejects requests with a forged Host header.
# ALLOWED_HOSTS defaults to "*" (off) for local dev; set it to your real
# domain(s) in production .env or this is a no-op.
#
# Internal callers are always allowed on top of ALLOWED_HOSTS — the backend
# publishes no ports, so these Host values can only come from inside the
# compose network:
#   - localhost / 127.0.0.1  → the container's own healthcheck
#   - backend                → the whatsapp-worker posting inbound-message and
#     status webhooks to http://backend:8000 (BACKEND_INTERNAL_URL). Without
#     this, every WhatsApp webhook is 400'd and messages never reach the app.
# Override the internal list with INTERNAL_ALLOWED_HOSTS if the service is
# named something else in your compose file.
if settings.is_production:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[*settings.ALLOWED_HOSTS, *settings.INTERNAL_ALLOWED_HOSTS],
    )


# Static media (AI-generated images, etc.)
_MEDIA_DIR = Path(__file__).resolve().parents[1] / "media"
_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_MEDIA_DIR)), name="media")

# Include API routers
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
    }


# Root endpoint
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint."""
    return {
        "message": f"Welcome to {settings.APP_NAME} API",
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else None,
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )