from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    balance_krw = Column(Float, default=10_000_000)
    balance_usd = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    holdings = relationship("Holding", back_populates="user")
    transactions = relationship("Transaction", back_populates="user")
    watchlist = relationship("Watchlist", back_populates="user")
    snapshots = relationship("PortfolioSnapshot", back_populates="user")
    game_sessions = relationship("GameSession", back_populates="user")


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (
        Index("ix_holdings_user_session", "user_id", "game_session_id"),
        Index("ix_holdings_session_market_ticker", "game_session_id", "market", "ticker"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=True)
    ticker = Column(String, nullable=False)
    name = Column(String)
    market = Column(String, nullable=False)
    sector = Column(String)
    industry = Column(String)
    quantity = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=False)
    currency = Column(String, nullable=False)

    user = relationship("User", back_populates="holdings")
    game_session = relationship("GameSession", back_populates="holdings")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_user_session_created", "user_id", "game_session_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=True)
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
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="transactions")
    game_session = relationship("GameSession", back_populates="transactions")


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
    __table_args__ = (
        Index("ix_snapshots_user_session_created", "user_id", "game_session_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    game_session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=True)
    total_value_krw = Column(Float, nullable=False)
    total_holdings_value_krw = Column(Float, nullable=False)
    cash_krw = Column(Float, nullable=False)
    cash_usd = Column(Float, nullable=False)
    exchange_rate = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="snapshots")
    game_session = relationship("GameSession", back_populates="snapshots")


class GameSession(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (
        Index("ix_game_sessions_user_status_start", "user_id", "status", "start_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    status = Column(String, nullable=True)
    starting_balance_krw = Column(Float, nullable=False)
    starting_balance_usd = Column(Float, default=0.0)
    cash_krw = Column(Float, nullable=True)
    cash_usd = Column(Float, nullable=True)
    duration_days = Column(Integer, nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True)
    final_value_krw = Column(Float, nullable=True)
    final_return_pct = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="game_sessions")
    holdings = relationship("Holding", back_populates="game_session")
    transactions = relationship("Transaction", back_populates="game_session")
    snapshots = relationship("PortfolioSnapshot", back_populates="game_session")
