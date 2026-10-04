"""Database session management.

Owned by Dev 2 (Backend Platform).
Provides synchronous SQLAlchemy engine and sessionmaker.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from backend.app.core.config import settings

# Use SYNC_DATABASE_URL to ensure no async loops are accidentally crossed
engine = create_engine(
    settings.SYNC_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
    connect_args={"connect_timeout": 1},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Dependency to yield a synchronous DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
