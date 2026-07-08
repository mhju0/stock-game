"""Idempotent demo seed.

On an empty database (e.g. a fresh Render container with an ephemeral disk),
this creates a known demo account with a baseline portfolio so a reviewer
always lands on a working app. It is safe to run on every boot: if any user
already exists it is a no-op, so it never duplicates data.

Seed data is built entirely from the in-process static dictionaries — it makes
no live market calls — so seeding works even when yfinance is unavailable.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import User, Holding, Transaction, GameSession, PortfolioSnapshot
from app.auth import hash_password
from app.services.stock_service import (
    KR_STOCK_NAMES_EN,
    US_STOCK_NAMES_EN,
)
from app.services.static_fundamentals import STATIC_FUNDAMENTALS
from app.services.exchange_service import get_exchange_rate

logger = logging.getLogger(__name__)

# Public so the frontend / docs can reference the same throwaway credentials.
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo1234"

STARTING_BALANCE_KRW = 10_000_000.0
DURATION_DAYS = 90

# Baseline holdings. avg_price is a fixed cost basis (no live lookup needed).
# (ticker, market, currency, quantity, avg_price)
_SEED_HOLDINGS = [
    ("005930.KS", "KRX", "KRW", 15, 70_000.0),
    ("AAPL", "US", "USD", 6, 180.0),
    ("NVDA", "US", "USD", 4, 120.0),
]

# Cash left after the baseline buys (roughly balances to ~10M KRW at ~1350 FX).
DEMO_BALANCE_KRW = 4_144_000.0
DEMO_BALANCE_USD = 2_000.0


def _name_for(ticker: str) -> str:
    return KR_STOCK_NAMES_EN.get(ticker) or US_STOCK_NAMES_EN.get(ticker) or ticker


def seed_demo(db: Session) -> bool:
    """Create the demo account if the DB has no users yet. Returns True if seeded."""
    if db.query(User).count() > 0:
        return False

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=10)  # backdated so the game shows elapsed time

    user = User(
        username=DEMO_USERNAME,
        hashed_password=hash_password(DEMO_PASSWORD),
        balance_krw=DEMO_BALANCE_KRW,
        balance_usd=DEMO_BALANCE_USD,
        created_at=start,
    )
    db.add(user)
    db.flush()  # assign user.id

    for ticker, market, currency, quantity, avg_price in _SEED_HOLDINGS:
        sector, industry = STATIC_FUNDAMENTALS.get(ticker, (None, None))
        name = _name_for(ticker)
        total = avg_price * quantity

        db.add(Holding(
            user_id=user.id, ticker=ticker, name=name, market=market,
            sector=sector, industry=industry, quantity=quantity,
            avg_price=avg_price, currency=currency,
        ))
        db.add(Transaction(
            user_id=user.id, ticker=ticker, name=name, market=market,
            transaction_type="BUY", quantity=quantity, price=avg_price,
            currency=currency, sector=sector, industry=industry,
            total_amount=total, realized_pnl=0.0, created_at=start,
        ))

    db.add(GameSession(
        user_id=user.id,
        starting_balance_krw=STARTING_BALANCE_KRW,
        starting_balance_usd=0.0,
        duration_days=DURATION_DAYS,
        start_date=start,
        end_date=start + timedelta(days=DURATION_DAYS),
        is_active=True,
    ))

    # Initial snapshot using cash only (no per-holding price fetch at boot to
    # keep cold start fast). get_exchange_rate() is bounded and falls back to a
    # constant when the live source is unavailable. The hourly snapshot loop
    # backfills full valuations later.
    rate = get_exchange_rate()
    db.add(PortfolioSnapshot(
        user_id=user.id,
        total_value_krw=round(DEMO_BALANCE_KRW + DEMO_BALANCE_USD * rate, 2),
        total_holdings_value_krw=0.0,
        cash_krw=DEMO_BALANCE_KRW,
        cash_usd=DEMO_BALANCE_USD,
        exchange_rate=rate,
        created_at=start,
    ))

    db.commit()
    logger.info("Seeded demo account '%s'", DEMO_USERNAME)
    return True
