import asyncpg
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.core.config import settings
from app.db.base import BaseModel


async def ensure_database_exists():
    """
    Check if database exists, create it if it doesn't.
    """
    # Extract database name from URL
    db_name = settings.DB_NAME
    db_user = settings.DB_USER
    db_password = settings.DB_PASSWORD
    db_host = settings.DB_HOST
    db_port = settings.DB_PORT
    
    # Connect to default postgres database to check/create
    default_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/postgres"
    
    try:
        conn = await asyncpg.connect(default_url)
        
        # Check if database exists
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


async def init_db():
    """
    Initialize database: create tables.
    """
    from app.db.base import engine
    
    # Ensure database exists
    await ensure_database_exists()
    
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(BaseModel.metadata.create_all)
        print("Tables created successfully.")