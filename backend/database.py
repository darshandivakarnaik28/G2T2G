"""
SQLAlchemy database setup for ISL Dataset Collector
Supports Central PostgreSQL (Production) and SQLite (Local Development)
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Detect central database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./isl_dataset.db")

# Normalize legacy Heroku/cloud URI scheme 'postgres://' to 'postgresql://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configure engine based on dialect
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL connection with robust connection pooling for concurrent remote team collectors
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=15,
        max_overflow=25
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
