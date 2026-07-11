"""Idempotent demo seed / reset.

The `demo` account is a public showcase for reviewers, so on every boot it is
reset to a known-good baseline: a session-scoped 90-day game with a
sector-diversified KR/US portfolio, one FX exchange, one realized-P/L sell,
and a synthetic daily snapshot series so the performance/benchmark charts
render from day one.

All deletes are strictly scoped to the demo user's id — other users' data is
never touched. Seed data is built entirely from in-process static
dictionaries (no live market calls), so seeding works even when yfinance is
unavailable, and the numbers below are deterministic.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import User, Holding, Transaction, GameSession, PortfolioSnapshot, Watchlist
from app.auth import hash_password
from app.services.stock_service import (
    KR_STOCK_NAMES_EN,
    US_STOCK_NAMES_EN,
)
from app.services.static_fundamentals import STATIC_FUNDAMENTALS

logger = logging.getLogger(__name__)

# Public so the frontend / docs can reference the same throwaway credentials.
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo1234"

STARTING_BALANCE_KRW = 10_000_000.0
DURATION_DAYS = 90
BACKDATE_DAYS = 12          # game shows ~12 elapsed days at seed time
SEED_RATE = 1500.0          # fixed FX rate, anchored to the live USD/KRW
                            # (~1498.7 on 2026-07-11) so snapshot valuations
                            # match the live-rate header

# Timeline of demo trades. day = offset from game start.
# ("EXCHANGE", day, amount_krw) — KRW -> USD at SEED_RATE
# ("BUY"/"SELL", day, ticker, market, currency, quantity, price)
#
# Cost bases are anchored to live closes as of 2026-07-11 (within a few
# percent), so the live-priced header, the snapshot-driven charts, and the
# daily-change chip all tell one consistent story: a modest, mixed-P/L
# portfolio. If the demo ages badly as markets move, re-anchor these prices.
_TIMELINE = [
    ("EXCHANGE", 0, 4_000_000.0),
    ("BUY", 0, "005930.KS", "KRX", "KRW", 8, 272_000.0),   # Samsung — Technology
    ("BUY", 0, "051910.KS", "KRX", "KRW", 5, 272_000.0),   # LG Chem — Basic Materials
    ("BUY", 1, "090430.KS", "KRX", "KRW", 10, 120_000.0),  # Amorepacific — Consumer Defensive
    ("BUY", 1, "JPM", "US", "USD", 3, 328.0),              # JPMorgan — Financial Services
    ("BUY", 2, "JNJ", "US", "USD", 3, 262.0),              # J&J — Healthcare
    ("BUY", 2, "XOM", "US", "USD", 4, 134.5),              # Exxon — Energy
    ("SELL", 6, "005930.KS", "KRX", "KRW", 3, 283_000.0),  # partial take-profit
]

# Daily drift applied to holdings' cost basis for the synthetic snapshot
# series (index = day). Ends near the live-priced valuation (+~1.3% over
# basis at anchor time) so the chart curve meets the live header instead of
# jumping. <!-- mock data, not historical prices -->
_DRIFT = [0.0, -0.003, 0.002, 0.005, 0.003, 0.007, 0.006, 0.009, 0.008, 0.011, 0.013, 0.012, 0.013]

# User-level watchlist starters (survive across games by design).
_WATCHLIST = [("035720.KS", "KRX"), ("MSFT", "US")]


def _name_for(ticker: str) -> str:
    return KR_STOCK_NAMES_EN.get(ticker) or US_STOCK_NAMES_EN.get(ticker) or ticker


def _reset_demo_rows(db: Session, user_id: int) -> None:
    """Delete all demo-owned rows. Scoped to user_id only — never touches
    other users."""
    for model in (PortfolioSnapshot, Transaction, Holding, Watchlist):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    db.query(GameSession).filter(GameSession.user_id == user_id).delete(synchronize_session=False)


def seed_demo(db: Session) -> bool:
    """Create or reset the public demo account to its baseline. Runs on every
    boot; returns True when the demo state was (re)built."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=BACKDATE_DAYS)

    user = db.query(User).filter(User.username == DEMO_USERNAME).first()
    if user is None:
        user = User(
            username=DEMO_USERNAME,
            hashed_password=hash_password(DEMO_PASSWORD),
            created_at=start,
        )
        db.add(user)
        db.flush()  # assign user.id
    else:
        _reset_demo_rows(db, user.id)

    session = GameSession(
        user_id=user.id,
        title="Demo Portfolio",
        status="active",
        starting_balance_krw=STARTING_BALANCE_KRW,
        starting_balance_usd=0.0,
        cash_krw=STARTING_BALANCE_KRW,
        cash_usd=0.0,
        duration_days=DURATION_DAYS,
        start_date=start,
        end_date=start + timedelta(days=DURATION_DAYS),
        is_active=True,
        created_at=start,
    )
    db.add(session)
    db.flush()  # assign session.id

    # Replay the timeline: mutate session cash, build holdings + transactions.
    holdings: dict[str, Holding] = {}
    for event in _TIMELINE:
        kind, day = event[0], event[1]
        stamp = start + timedelta(days=day, hours=5)
        if kind == "EXCHANGE":
            amount_krw = event[2]
            converted = round(amount_krw / SEED_RATE, 2)
            session.cash_krw -= amount_krw
            session.cash_usd += converted
            db.add(Transaction(
                user_id=user.id, game_session_id=session.id,
                ticker="KRW/USD", name="Currency Exchange", market="FX",
                transaction_type="EXCHANGE", quantity=1, price=SEED_RATE,
                currency="KRW", sector="Currency", industry="Foreign Exchange",
                total_amount=amount_krw, realized_pnl=0.0, created_at=stamp,
            ))
            continue

        _, _, ticker, market, currency, quantity, price = event
        sector, industry = STATIC_FUNDAMENTALS.get(ticker, (None, None))
        name = _name_for(ticker)
        total = round(price * quantity, 2)

        if kind == "BUY":
            if currency == "KRW":
                session.cash_krw -= total
            else:
                session.cash_usd -= total
            h = holdings.get(ticker)
            if h is None:
                h = Holding(
                    user_id=user.id, game_session_id=session.id,
                    ticker=ticker, name=name, market=market, sector=sector,
                    industry=industry, quantity=quantity, avg_price=price,
                    currency=currency,
                )
                holdings[ticker] = h
                db.add(h)
            else:
                new_qty = h.quantity + quantity
                h.avg_price = (h.avg_price * h.quantity + total) / new_qty
                h.quantity = new_qty
            realized = 0.0
        else:  # SELL
            h = holdings[ticker]
            realized = round((price - h.avg_price) * quantity, 2)
            h.quantity -= quantity
            if currency == "KRW":
                session.cash_krw += total
            else:
                session.cash_usd += total

        db.add(Transaction(
            user_id=user.id, game_session_id=session.id,
            ticker=ticker, name=name, market=market,
            transaction_type=kind, quantity=quantity, price=price,
            currency=currency, sector=sector, industry=industry,
            total_amount=total, realized_pnl=realized, created_at=stamp,
        ))

    session.cash_krw = round(session.cash_krw, 2)
    session.cash_usd = round(session.cash_usd, 2)

    # Legacy mirror for old routes that still read User.balance_*.
    user.balance_krw = session.cash_krw
    user.balance_usd = session.cash_usd

    # Synthetic daily snapshots: replay cash state per day, value holdings at
    # cost basis times a fixed drift so the charts have a believable series.
    for day in range(BACKDATE_DAYS + 1):
        cash_krw, cash_usd = STARTING_BALANCE_KRW, 0.0
        basis_krw = 0.0
        positions: dict[str, list[float]] = {}  # ticker -> [qty, avg, krw?]
        for event in _TIMELINE:
            if event[1] > day:
                continue
            if event[0] == "EXCHANGE":
                cash_krw -= event[2]
                cash_usd += round(event[2] / SEED_RATE, 2)
                continue
            kind, _, ticker, _, currency, quantity, price = event
            fx = 1.0 if currency == "KRW" else SEED_RATE
            if kind == "BUY":
                if currency == "KRW":
                    cash_krw -= price * quantity
                else:
                    cash_usd -= price * quantity
                pos = positions.setdefault(ticker, [0.0, 0.0, fx])
                pos[1] = (pos[1] * pos[0] + price * quantity) / (pos[0] + quantity)
                pos[0] += quantity
            else:
                pos = positions[ticker]
                pos[0] -= quantity
                if currency == "KRW":
                    cash_krw += price * quantity
                else:
                    cash_usd += price * quantity
        basis_krw = sum(qty * avg * fx for qty, avg, fx in positions.values())
        holdings_value = round(basis_krw * (1 + _DRIFT[min(day, len(_DRIFT) - 1)]), 2)
        db.add(PortfolioSnapshot(
            user_id=user.id, game_session_id=session.id,
            total_value_krw=round(cash_krw + cash_usd * SEED_RATE + holdings_value, 2),
            total_holdings_value_krw=holdings_value,
            cash_krw=round(cash_krw, 2), cash_usd=round(cash_usd, 2),
            exchange_rate=SEED_RATE,
            created_at=start + timedelta(days=day, hours=8),
        ))

    for ticker, market in _WATCHLIST:
        db.add(Watchlist(user_id=user.id, ticker=ticker, name=_name_for(ticker), market=market))

    db.commit()
    logger.info("Demo account '%s' reset to baseline", DEMO_USERNAME)
    return True
