import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

connect_args = {}
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql"):
    try:
        import psycopg  # noqa: F401  (the Postgres driver; only a missing driver falls back)
    except ImportError:
        logging.getLogger("nimbus.db").error(
            "DATABASE_URL is Postgres but the psycopg driver isn't installed: using local SQLite instead")
        db_url = "sqlite:///./nimbus.db"
if db_url.startswith("postgresql"):
    # Connection errors surface here and at first query, never as a silent switch to SQLite
    engine = create_engine(db_url, pool_pre_ping=True, pool_size=10, max_overflow=20)
else:
    connect_args = {"check_same_thread": False}
    engine = create_engine(db_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for FastAPI routes to get DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
