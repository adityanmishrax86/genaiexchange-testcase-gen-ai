# src/db.py
from sqlmodel import create_engine, Session
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///data.db")
# echo True for dev query logs
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})

def get_session():
    return Session(engine)
