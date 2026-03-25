from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    balance_krw = Column(Float, default=10_000_000)
    balance_usd = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    holdings = relationship("Holding", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    watchlist = relationship("Watchlist", back_populates="user")
    snapshots = relationship("PortfolioSnapshot", back_populates="user")
    game_sessions = relationship("GameSession", back_populates="user")


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    name = Column(String)
    market = Column(String, nullable=False)
    sector = Column(String)
    industry = Column(String)
    quantity = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=False)
    currency = Column(String, nullable=False)

    user = relationship("User", back_populates="holdings")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    name = Column(String)
    market = Column(String, nullable=False)
    transaction_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    sector = Column(String)
    industry = Column(String)
    total_amount = Column(Float, nullable=False)
    realized_pnl = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="transactions")


class Watchlist(Base):
    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker = Column(String, nullable=False)
    name = Column(String)
    market = Column(String, nullable=False)

    user = relationship("User", back_populates="watchlist")


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    total_value_krw = Column(Float, nullable=False)
    total_holdings_value_krw = Column(Float, nullable=False)
    cash_krw = Column(Float, nullable=False)
    cash_usd = Column(Float, nullable=False)
    exchange_rate = Column(Float, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="snapshots")


class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    starting_balance_krw = Column(Float, nullable=False)
    starting_balance_usd = Column(Float, default=0.0)
    duration_days = Column(Integer, nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    final_value_krw = Column(Float, nullable=True)
    final_return_pct = Column(Float, nullable=True)

    user = relationship("User", back_populates="game_sessions")