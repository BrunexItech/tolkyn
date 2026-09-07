import os
import json
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import ConfigDict, Field, EmailStr, field_validator


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    APP_NAME: str = "Tolkyn"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"  # development, staging, production
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Background scheduler — publishes due scheduled posts on a timer,
    # in-process, no separate worker needed.
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_INTERVAL_SECONDS: int = 60
    
    # Database
    DB_HOST: str = Field(default="localhost", description="Database host")
    DB_PORT: int = Field(default=5432, description="Database port")
    DB_NAME: str = Field(default="tolkyn", description="Database name")
    DB_USER: str = Field(default="postgres", description="Database user")
    DB_PASSWORD: str = Field(default="postgres", description="Database password")
    # Per-process pool. Total real connections to Postgres = (API replicas ×
    # workers per replica) × (DB_POOL_SIZE + DB_MAX_OVERFLOW) — keep that under
    # Postgres's own max_connections when you scale workers up.
    DB_POOL_SIZE: int = Field(default=10, description="SQLAlchemy pool size per worker process")
    DB_MAX_OVERFLOW: int = Field(default=20, description="SQLAlchemy overflow connections per worker process")
    
    @property
    def DATABASE_URL(self) -> str:
        """Construct PostgreSQL connection string."""
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    
    # Security
    SECRET_KEY: str = Field(default="your-super-secret-key-change-in-production", description="JWT secret key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Super admin (platform operator) — seeded into its own table on startup.
    # Never mixed into the regular `users` table / tenant auth.
    SUPER_ADMIN_EMAIL: Optional[str] = Field(default=None, description="Super admin login email")
    SUPER_ADMIN_PASSWORD: Optional[str] = Field(default=None, description="Super admin login password")
    SUPER_ADMIN_NAME: str = Field(default="Super Admin", description="Super admin display name")
    SUPER_ADMIN_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours — shorter-lived than tenant sessions
    
    # CORS
    # NOTE: pydantic-settings JSON-decodes list fields at the source level
    # before any validator runs, so in .env these MUST be a JSON array, e.g.
    #   ALLOWED_ORIGINS=["https://tolkyn.co.ke","https://www.tolkyn.co.ke"]
    # A bare comma-separated string raises SettingsError on boot.
    ALLOWED_ORIGINS: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed CORS origins"
    )
    ALLOWED_METHODS: list[str] = ["*"]
    ALLOWED_HEADERS: list[str] = ["*"]

    # Host header validation (TrustedHostMiddleware, production only). "*"
    # would defeat the point — set this to your real domain(s) in .env,
    # e.g. "tolkyn.co.ke,www.tolkyn.co.ke". Defaults permissive for local dev.
    ALLOWED_HOSTS: list[str] = Field(default=["*"], description="Allowed Host header values in production")

    # Internal Host values always accepted on top of ALLOWED_HOSTS (see
    # main.py). "backend" is the whatsapp-worker → backend webhook target;
    # loopback is the container's own healthcheck. Set as a JSON array in .env
    # only if your compose service name differs.
    INTERNAL_ALLOWED_HOSTS: list[str] = Field(
        default=["localhost", "127.0.0.1", "backend"],
        description="Internal Host header values always trusted (compose network)",
    )

    # Rate limiting (slowapi). Backed by Redis when available so limits are
    # shared across every API replica/worker, not just the process that
    # happened to handle the request — falls back to in-memory (per-process
    # only) if Redis isn't reachable, which is fine for a single-instance dev
    # setup but not a real limit once you scale to more than one replica.
    RATE_LIMIT_DEFAULT: str = Field(default="240/minute", description="Default per-IP request budget")
    RATE_LIMIT_AUTH: str = Field(default="10/minute", description="Per-IP budget for login/register/invite-accept")
    
    # Email
    SMTP_HOST: str = Field(default="smtp.gmail.com", description="SMTP host")
    SMTP_PORT: int = Field(default=587, description="SMTP port")
    SMTP_USER: Optional[str] = Field(default=None, description="SMTP username")
    SMTP_PASSWORD: Optional[str] = Field(default=None, description="SMTP password")
    SMTP_FROM_EMAIL: str = Field(default="noreply@tolkyn.co.ke", description="From email address")
    SMTP_FROM_NAME: str = "Tolkyn"
    
    # Redis
    REDIS_HOST: str = Field(default="localhost", description="Redis host")
    REDIS_PORT: int = Field(default=6379, description="Redis port")
    REDIS_DB: int = Field(default=0, description="Redis database")
    REDIS_PASSWORD: Optional[str] = Field(default=None, description="Redis password")
    
    @property
    def REDIS_URL(self) -> str:
        """Construct Redis connection string."""
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
    
    # AI
    GROQ_API_KEY: Optional[str] = Field(default=None, description="Groq API Key")
    OPENAI_API_KEY: Optional[str] = Field(default=None, description="OpenAI API Key")
    # gpt-image-2 is what ChatGPT itself uses (branded "ChatGPT Images 2.0") —
    # cleaner photos, far better text rendering, up to 2K. Override in .env.
    OPENAI_IMAGE_MODEL: str = Field(default="gpt-image-2", description="OpenAI image model")

    # Video generation — Google Veo 3.1 via the Gemini API
    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Gemini API key (Veo 3.1 video generation)")
    GEMINI_API_BASE: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta", description="Gemini API base URL"
    )

    # Geo targeting (optional — falls back to keyless OpenStreetMap/Nominatim)
    GEOAPIFY_API_KEY: Optional[str] = Field(default=None, description="Geoapify key (free tier)")

    # Media intelligence — live web/news search (optional — falls back to model knowledge)
    TAVILY_API_KEY: Optional[str] = Field(default=None, description="Tavily search key (built for AI)")
    SERPER_API_KEY: Optional[str] = Field(default=None, description="Serper.dev Google search key")

    # Public URL of the frontend (used to build OAuth redirect targets)
    FRONTEND_URL: str = Field(default="http://localhost:3000", description="Public frontend base URL")
    # Public URL of this backend (used to build webhook targets we hand to
    # third parties — e.g. the PBX event webhook).
    BACKEND_PUBLIC_URL: str = Field(default="http://localhost:8000", description="Public backend base URL")

    # Social publishing / account connections (Upload-Post)
    UPLOAD_POST_API_KEY: Optional[str] = Field(default=None, description="Upload-Post API key")
    UPLOAD_POST_BASE_URL: str = Field(
        default="https://api.upload-post.com/api", description="Upload-Post API base URL"
    )

    # Messaging — Bulk SMS. Mobile Sasa is primary; Twilio is a fallback; both
    # optional — with neither set the send is simulated.
    MOBILESASA_TOKEN: Optional[str] = Field(default=None, description="Mobile Sasa API token (mbs_...)")
    MOBILESASA_SENDER_ID: str = Field(default="MOBILESASA", description="Mobile Sasa sender ID")
    MOBILESASA_BASE_URL: str = Field(default="https://api.mobilesasa.com", description="Mobile Sasa API base URL")
    DEFAULT_COUNTRY_CODE: str = Field(default="+254", description="E.164 country code assumed for local phone numbers")
    TWILIO_ACCOUNT_SID: Optional[str] = Field(default=None, description="Twilio Account SID")
    TWILIO_AUTH_TOKEN: Optional[str] = Field(default=None, description="Twilio Auth Token")
    TWILIO_SMS_FROM: Optional[str] = Field(default=None, description="Twilio SMS sender (E.164 or messaging service SID)")
    # Messaging — WhatsApp Cloud API (optional — falls back to a simulated send)
    WHATSAPP_TOKEN: Optional[str] = Field(default=None, description="Meta WhatsApp Cloud API permanent token")
    WHATSAPP_PHONE_NUMBER_ID: Optional[str] = Field(default=None, description="WhatsApp phone number ID")

    # Messaging — self-hosted WhatsApp Web sessions (Baileys worker), the
    # unofficial/at-your-own-risk alternative while waiting on the Cloud API.
    WHATSAPP_WORKER_URL: str = Field(
        default="http://whatsapp-worker:4001", description="Internal URL of the whatsapp-worker service"
    )
    INTERNAL_SHARED_SECRET: str = Field(
        default="", description="Shared secret authenticating backend <-> whatsapp-worker calls"
    )

    # Social API Keys (for future integration)
    FACEBOOK_APP_ID: Optional[str] = Field(default=None, description="Facebook App ID")
    FACEBOOK_APP_SECRET: Optional[str] = Field(default=None, description="Facebook App Secret")
    INSTAGRAM_APP_ID: Optional[str] = Field(default=None, description="Instagram App ID")
    INSTAGRAM_APP_SECRET: Optional[str] = Field(default=None, description="Instagram App Secret")
    LINKEDIN_CLIENT_ID: Optional[str] = Field(default=None, description="LinkedIn Client ID")
    LINKEDIN_CLIENT_SECRET: Optional[str] = Field(default=None, description="LinkedIn Client Secret")
    TWITTER_API_KEY: Optional[str] = Field(default=None, description="Twitter API Key")
    TWITTER_API_SECRET: Optional[str] = Field(default=None, description="Twitter API Secret")
    YOUTUBE_API_KEY: Optional[str] = Field(default=None, description="YouTube API Key")
    
    # Third-party Services
    S3_ACCESS_KEY: Optional[str] = Field(default=None, description="S3 Access Key")
    S3_SECRET_KEY: Optional[str] = Field(default=None, description="S3 Secret Key")
    S3_BUCKET: Optional[str] = Field(default=None, description="S3 Bucket Name")
    S3_REGION: str = Field(default="us-east-1", description="S3 Region")
    S3_ENDPOINT_URL: Optional[str] = Field(default=None, description="S3 Endpoint URL")
    
    @field_validator("ALLOWED_ORIGINS", "ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value):
        """Parse a comma-separated (or JSON-array) env var into a list."""
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.APP_ENV == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.APP_ENV == "development"
    
    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


# Create singleton instance
settings = Settings()


# Helper function to get settings
def get_settings() -> Settings:
    """Return the application settings."""
    return settings