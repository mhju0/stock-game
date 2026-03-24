from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# Find the absolute path of the directory where this database.py file lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Dynamically construct the path to the SQLite database file in the same directory
db_path = os.path.join(BASE_DIR, "stock_game.db")
DATABASE_URL = f"sqlite:///{db_path}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()