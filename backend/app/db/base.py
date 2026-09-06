from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, declared_attr
from sqlalchemy import Column, DateTime, String, func
from typing import AsyncGenerator
import uuid
import asyncpg

from app.core.config import settings

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base:
    """Base model with common fields and utilities."""
    
    @declared_attr
    def __tablename__(cls):
        """Generate table name from class name."""
        return cls.__name__.lower()
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


# Create declarative base
BaseModel = declarative_base(cls=Base)


# Dependency to get database session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Database session dependency for FastAPI."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def ensure_database_exists():
    """
    Check if database exists, create it if it doesn't.
    """
    db_name = settings.DB_NAME
    db_user = settings.DB_USER
    db_password = settings.DB_PASSWORD
    db_host = settings.DB_HOST
    db_port = settings.DB_PORT
    
    default_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/postgres"
    
    try:
        conn = await asyncpg.connect(default_url)
        
        result = await conn.fetch(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )
        
        if not result:
            print(f"Database '{db_name}' does not exist. Creating...")
            await conn.execute(f'CREATE DATABASE "{db_name}"')
            print(f"Database '{db_name}' created successfully.")
        else:
            print(f"Database '{db_name}' already exists.")
        
        await conn.close()
        
    except asyncpg.exceptions.InvalidPasswordError:
        print("Invalid password. Please check your database credentials.")
        raise
    except Exception as e:
        print(f"Error connecting to PostgreSQL: {e}")
        print("Make sure PostgreSQL is running.")
        raise


from sqlalchemy import text as _sql_text

# Lightweight, idempotent column additions for tables that already exist.
# (create_all never ALTERs an existing table.)
_SCHEMA_PATCHES = [
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_customer_id VARCHAR(36)",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_subject VARCHAR(255)",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_email TEXT",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_proposal TEXT",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_generated_at TIMESTAMPTZ",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_sent_at TIMESTAMPTZ",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS outreach_sent_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS music JSONB",
    "ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(600)",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS provider_jobs JSONB",
    "ALTER TABLE inbox_threads ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual'",
    "ALTER TABLE inbox_threads ADD COLUMN IF NOT EXISTS external_id VARCHAR(200)",
    "ALTER TABLE inbox_threads ADD COLUMN IF NOT EXISTS ref JSONB",
    "CREATE INDEX IF NOT EXISTS ix_inbox_threads_external_id ON inbox_threads (external_id)",
    "ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(200)",
    "CREATE INDEX IF NOT EXISTS ix_inbox_messages_external_id ON inbox_messages (external_id)",
    # Approval gate: existing accounts stay approved (DEFAULT true backfills
    # every current row); only NEW registrations are created with this False.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT true",
    # A Subsidiary/subdomain can only be created once its Organization is
    # linked to a real, approved main account.
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(36)",
    "CREATE INDEX IF NOT EXISTS ix_organizations_owner_user_id ON organizations (owner_user_id)",
    # Video generation governance
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_video_models JSON NOT NULL DEFAULT '[]'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS video_budget_usd DOUBLE PRECISION",
    "ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS brand_logo_url VARCHAR(500)",
    "ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS brand_colors JSON",
    "ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS like_count INTEGER",
    "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_area_ids JSON NOT NULL DEFAULT '[]'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS brand_logo_url VARCHAR(500)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS brand_colors JSON",
    # one-time purge of the pre-Upload-Post simulated connections
    "DELETE FROM social_connections WHERE account_ref IS NULL AND access_token_enc IS NULL "
    "AND handle IN ('@omnimedia', 'OmniMedia', 'Business')",
    # Team invite-acceptance (real login for an invited teammate)
    "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_token_hash VARCHAR(64)",
    "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ",
    "CREATE INDEX IF NOT EXISTS ix_team_members_invite_token_hash ON team_members (invite_token_hash)",
    # Post approval workflow
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS pending_scheduled_at TIMESTAMPTZ",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS pending_timezone VARCHAR(64)",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_by VARCHAR(36)",
    "ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
    # Named business-event activity logging (app.core.activity_context)
    "ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS detail JSON",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_ip VARCHAR(50)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS package_id VARCHAR(36)",
    "ALTER TABLE call_agents ADD COLUMN IF NOT EXISTS sip_extension VARCHAR(32)",
    "ALTER TABLE call_agents ADD COLUMN IF NOT EXISTS sip_password_enc VARCHAR(500)",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider_channel_id VARCHAR(128)",
    "ALTER TABLE calls ADD COLUMN IF NOT EXISTS ivr_state JSONB",
    "ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS email_campaign_id VARCHAR(36)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_image_limit INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_video_limit INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS module_overrides JSON NOT NULL DEFAULT '{}'",
]

# New values for existing PG enum types. `ALTER TYPE ... ADD VALUE` cannot run
# inside the create_all transaction block, so these go through their own
# autocommit connection.
_ENUM_VALUE_PATCHES = [
    # SQLAlchemy stores Enum members by NAME, so the value must be upper-case.
    ("customersource", "SOCIAL"),
]


async def init_db():
    """Create all tables and initialize database."""
    # Ensure database exists
    await ensure_database_exists()

    # Make sure every model module is imported so metadata is complete
    import app.models  # noqa: F401

    # Enum value additions must happen first, on their own autocommit connection,
    # so a later INSERT of that value (e.g. from create_all defaults) is valid.
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        for type_name, value in _ENUM_VALUE_PATCHES:
            try:
                await conn.execute(
                    _sql_text(f"ALTER TYPE {type_name} ADD VALUE IF NOT EXISTS '{value}'")
                )
            except Exception as exc:  # pragma: no cover - best effort in dev
                print(f"[init_db] enum patch skipped ({type_name}={value}): {exc}")

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
        for stmt in _SCHEMA_PATCHES:
            try:
                await conn.execute(_sql_text(stmt))
            except Exception as exc:  # pragma: no cover - best effort in dev
                print(f"[init_db] schema patch skipped: {exc}")
        print("Tables created / patched successfully.")

    await seed_super_admin()
    await seed_packages()


async def seed_packages() -> None:
    """Insert the default pricing packages the first time the table is empty.
    Never overwrites: once the super admin has curated packages, this is inert."""
    from sqlalchemy import func as _func, select as _select

    from app.core.features import DEFAULT_PACKAGES
    from app.models.package import Package

    async with AsyncSessionLocal() as db:
        try:
            count = (await db.execute(_select(_func.count()).select_from(Package))).scalar() or 0
            if count:
                return
            for spec in DEFAULT_PACKAGES:
                db.add(Package(**spec))
            await db.commit()
            print(f"[init_db] seeded {len(DEFAULT_PACKAGES)} default packages")
        except Exception as exc:  # pragma: no cover - best effort in dev
            print(f"[init_db] package seed skipped: {exc}")


async def seed_super_admin() -> None:
    """Ensure the platform's super-admin account exists, from .env. Runs on
    every startup so rotating SUPER_ADMIN_PASSWORD in .env and restarting is
    all it takes to change it — the DB row is kept in sync with .env, not the
    other way round."""
    from sqlalchemy import select as _select

    from app.core.config import settings
    from app.core.security import get_password_hash
    from app.models.super_admin import SuperAdmin

    if not settings.SUPER_ADMIN_EMAIL or not settings.SUPER_ADMIN_PASSWORD:
        return

    async with AsyncSessionLocal() as db:
        try:
            res = await db.execute(
                _select(SuperAdmin).where(SuperAdmin.email == settings.SUPER_ADMIN_EMAIL)
            )
            row = res.scalar_one_or_none()
            new_hash = get_password_hash(settings.SUPER_ADMIN_PASSWORD)
            if row is None:
                db.add(
                    SuperAdmin(
                        name=settings.SUPER_ADMIN_NAME,
                        email=settings.SUPER_ADMIN_EMAIL,
                        password_hash=new_hash,
                    )
                )
                await db.commit()
                print(f"[init_db] super admin created: {settings.SUPER_ADMIN_EMAIL}")
            else:
                row.name = settings.SUPER_ADMIN_NAME
                row.password_hash = new_hash
                await db.commit()
        except Exception as exc:  # pragma: no cover - best effort in dev
            print(f"[init_db] super admin seed skipped: {exc}")


async def drop_db():
    """Drop all tables (for testing only)."""
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.drop_all)
        print("Tables dropped successfully.")


def get_engine():
    """Get the database engine for Alembic."""
    return engine