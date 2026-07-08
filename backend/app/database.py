import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

BASE_DIR = Path(__file__).resolve().parent.parent

# Prefer DATABASE_URL (Supabase Postgres via the Supavisor session pooler).
# Fall back to a local SQLite file so dev without the env var still works.
# load_dotenv() is invoked by app.main before this module is imported.
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{BASE_DIR}/stock_game.db"

# SQLAlchemy + psycopg2 needs the "postgresql://" scheme; normalize the legacy
# "postgres://" form some providers emit so it doesn't raise on dialect lookup.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql://" + DATABASE_URL[len("postgres://"):]

if DATABASE_URL.startswith("sqlite"):
    # check_same_thread is a SQLite-only flag; invalid on Postgres.
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Always-on server behind the session pooler: keep a small pool and verify
    # connections before use so recycled/dead pooled conns don't surface errors.
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_recycle=1800,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()