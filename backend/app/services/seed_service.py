"""Idempotent demo seed / reset.

The `demo` account is a public showcase for reviewers, so on every boot it is
reset to a known-good baseline: two active games plus three completed/archived
spring and summer 2026 games. The primary 90-day game has a sector-diversified
KR/US portfolio, one FX exchange, one realized-P/L sell, and a synthetic daily
snapshot series so the performance/benchmark charts render from day one.

All deletes are strictly scoped to the demo user's id — other users' data is
never touched. Seed data is built entirely from in-process static
definitions (no live market calls), so seeding works even when yfinance is
unavailable, and the numbers below are deterministic.
"""

import logging
from dataclasses import dataclass
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
PRIMARY_START = datetime(2026, 7, 2, tzinfo=timezone.utc)
BACKDATE_DAYS = 12          # fixed July 2–14 showcase snapshot window
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


@dataclass(frozen=True)
class RoundTrip:
    ticker: str
    quantity: float
    buy_price: float
    sell_price: float
    buy_day: int
    sell_day: int


@dataclass(frozen=True)
class SnapshotPoint:
    day: int
    value_factor: float


@dataclass(frozen=True)
class ClosedGameSpec:
    title: str
    status: str
    start: datetime
    duration_days: int
    starting_balance_krw: float
    round_trips: tuple[RoundTrip, ...]
    snapshots: tuple[SnapshotPoint, ...]


# Fixed dates intentionally preserve the Spring/Summer 2026 release showcase.
# Re-anchor the active examples before October 2026 so they do not read as
# expired in future screenshots.
_CLOSED_GAMES = (
    ClosedGameSpec(
        title="Spring Growth Sprint",
        status="completed",
        start=datetime(2026, 3, 16, tzinfo=timezone.utc),
        duration_days=45,
        starting_balance_krw=10_000_000.0,
        round_trips=(
            RoundTrip("000660.KS", 10, 420_000.0, 448_000.0, 1, 25),
            RoundTrip("035420.KS", 15, 210_000.0, 227_000.0, 4, 32),
            RoundTrip("068270.KS", 12, 170_000.0, 179_000.0, 7, 42),
        ),
        snapshots=(
            SnapshotPoint(0, 1.0),
            SnapshotPoint(7, 0.991),
            SnapshotPoint(15, 1.008),
            SnapshotPoint(24, 1.026),
            SnapshotPoint(34, 1.045),
            SnapshotPoint(45, 1.0643),
        ),
    ),
    ClosedGameSpec(
        title="Value Rebound Test",
        status="archived",
        start=datetime(2026, 4, 13, tzinfo=timezone.utc),
        duration_days=45,
        starting_balance_krw=8_000_000.0,
        round_trips=(
            RoundTrip("005380.KS", 20, 230_000.0, 224_000.0, 1, 25),
            RoundTrip("051910.KS", 10, 280_000.0, 276_000.0, 4, 32),
            RoundTrip("105560.KS", 5, 120_000.0, 125_000.0, 7, 42),
        ),
        snapshots=(
            SnapshotPoint(0, 1.0),
            SnapshotPoint(8, 0.982),
            SnapshotPoint(16, 0.963),
            SnapshotPoint(25, 0.978),
            SnapshotPoint(35, 0.971),
            SnapshotPoint(45, 0.983125),
        ),
    ),
    ClosedGameSpec(
        title="AI & Chips Rotation",
        status="completed",
        start=datetime(2026, 5, 5, tzinfo=timezone.utc),
        duration_days=30,
        starting_balance_krw=20_000_000.0,
        round_trips=(
            RoundTrip("000660.KS", 20, 440_000.0, 452_000.0, 1, 19),
            RoundTrip("005930.KS", 25, 275_000.0, 281_000.0, 3, 24),
            RoundTrip("035420.KS", 15, 215_000.0, 225_000.0, 5, 29),
        ),
        snapshots=(
            SnapshotPoint(0, 1.0),
            SnapshotPoint(5, 0.986),
            SnapshotPoint(11, 1.008),
            SnapshotPoint(17, 1.021),
            SnapshotPoint(24, 1.018),
            SnapshotPoint(30, 1.027),
        ),
    ),
)


def _name_for(ticker: str) -> str:
    return KR_STOCK_NAMES_EN.get(ticker) or US_STOCK_NAMES_EN.get(ticker) or ticker


def _reset_demo_rows(db: Session, user_id: int) -> None:
    """Delete all demo-owned rows. Scoped to user_id only — never touches
    other users."""
    for model in (PortfolioSnapshot, Transaction, Holding, Watchlist):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)
    db.query(GameSession).filter(GameSession.user_id == user_id).delete(synchronize_session=False)


def _add_equity_transaction(
    db: Session,
    user: User,
    session: GameSession,
    *,
    kind: str,
    ticker: str,
    quantity: float,
    price: float,
    created_at: datetime,
    realized_pnl: float = 0.0,
) -> None:
    market = "KRX" if ticker.endswith(".KS") else "US"
    currency = "KRW" if market == "KRX" else "USD"
    sector, industry = STATIC_FUNDAMENTALS.get(ticker, (None, None))
    db.add(Transaction(
        user_id=user.id,
        game_session_id=session.id,
        ticker=ticker,
        name=_name_for(ticker),
        market=market,
        transaction_type=kind,
        quantity=quantity,
        price=price,
        currency=currency,
        sector=sector,
        industry=industry,
        total_amount=round(quantity * price, 2),
        realized_pnl=round(realized_pnl, 2),
        created_at=created_at,
    ))


def _seed_dividend_game(db: Session, user: User) -> None:
    """Add a smaller active game with a conservative KR/US mix."""
    start = datetime(2026, 6, 15, tzinfo=timezone.utc)
    starting_balance = 5_000_000.0
    session = GameSession(
        user_id=user.id,
        title="Dividend & Quality",
        status="active",
        starting_balance_krw=starting_balance,
        starting_balance_usd=0.0,
        cash_krw=1_775_000.0,
        cash_usd=412.0,
        duration_days=90,
        start_date=start,
        end_date=start + timedelta(days=90),
        is_active=True,
        created_at=start,
        updated_at=start + timedelta(days=29, hours=8),
    )
    db.add(session)
    db.flush()

    db.add(Transaction(
        user_id=user.id,
        game_session_id=session.id,
        ticker="KRW/USD",
        name="Currency Exchange",
        market="FX",
        transaction_type="EXCHANGE",
        quantity=1,
        price=SEED_RATE,
        currency="KRW",
        sector="Currency",
        industry="Foreign Exchange",
        total_amount=2_100_000.0,
        realized_pnl=0.0,
        created_at=start + timedelta(hours=2),
    ))

    active_trades = (
        ("BUY", "KO", 4, 72.0, 1, 0.0),
        ("BUY", "V", 2, 350.0, 2, 0.0),
        ("BUY", "105560.KS", 15, 115_000.0, 3, 0.0),
        ("SELL", "105560.KS", 5, 120_000.0, 22, 25_000.0),
    )
    for kind, ticker, quantity, price, day, realized_pnl in active_trades:
        _add_equity_transaction(
            db,
            user,
            session,
            kind=kind,
            ticker=ticker,
            quantity=quantity,
            price=price,
            realized_pnl=realized_pnl,
            created_at=start + timedelta(days=day, hours=5),
        )

    for ticker, quantity, avg_price in (
        ("KO", 4, 72.0),
        ("V", 2, 350.0),
        ("105560.KS", 10, 115_000.0),
    ):
        market = "KRX" if ticker.endswith(".KS") else "US"
        sector, industry = STATIC_FUNDAMENTALS.get(ticker, (None, None))
        db.add(Holding(
            user_id=user.id,
            game_session_id=session.id,
            ticker=ticker,
            name=_name_for(ticker),
            market=market,
            sector=sector,
            industry=industry,
            quantity=quantity,
            avg_price=avg_price,
            currency="KRW" if market == "KRX" else "USD",
        ))

    snapshot_values = (
        (0, 5_000_000.0),
        (6, 4_960_000.0),
        (12, 5_015_000.0),
        (18, 5_070_000.0),
        (24, 5_045_000.0),
        (29, 5_090_000.0),
    )
    for day, total_value in snapshot_values:
        cash_krw = starting_balance
        cash_usd = 0.0
        if day >= 0:
            cash_krw -= 2_100_000.0
            cash_usd += 1_400.0
        if day >= 1:
            cash_usd -= 288.0
        if day >= 2:
            cash_usd -= 700.0
        if day >= 3:
            cash_krw -= 1_725_000.0
        if day >= 22:
            cash_krw += 600_000.0
        holdings_value = total_value - cash_krw - (cash_usd * SEED_RATE)
        db.add(PortfolioSnapshot(
            user_id=user.id,
            game_session_id=session.id,
            total_value_krw=total_value,
            total_holdings_value_krw=round(holdings_value, 2),
            cash_krw=round(cash_krw, 2),
            cash_usd=round(cash_usd, 2),
            exchange_rate=SEED_RATE,
            created_at=start + timedelta(days=day, hours=8),
        ))


def _cash_after_closed_trades(
    starting_balance: float,
    round_trips: tuple[RoundTrip, ...],
    day: int,
) -> float:
    cash = starting_balance
    for trade in round_trips:
        if trade.buy_day <= day:
            cash -= trade.quantity * trade.buy_price
        if trade.sell_day <= day:
            cash += trade.quantity * trade.sell_price
    return round(cash, 2)


def _seed_closed_game(db: Session, user: User, spec: ClosedGameSpec) -> None:
    start = spec.start
    duration_days = spec.duration_days
    starting_balance = spec.starting_balance_krw
    round_trips = spec.round_trips
    completed_at = start + timedelta(days=duration_days, hours=18)
    realized_total = sum(
        (trade.sell_price - trade.buy_price) * trade.quantity
        for trade in round_trips
    )
    final_value = round(starting_balance + realized_total, 2)
    final_return_pct = round((realized_total / starting_balance) * 100, 4)

    session = GameSession(
        user_id=user.id,
        title=spec.title,
        status=spec.status,
        starting_balance_krw=starting_balance,
        starting_balance_usd=0.0,
        cash_krw=final_value,
        cash_usd=0.0,
        duration_days=duration_days,
        start_date=start,
        end_date=start + timedelta(days=duration_days),
        is_active=False,
        final_value_krw=final_value,
        final_return_pct=final_return_pct,
        created_at=start,
        updated_at=completed_at,
        completed_at=completed_at,
    )
    db.add(session)
    db.flush()

    for trade in round_trips:
        _add_equity_transaction(
            db,
            user,
            session,
            kind="BUY",
            ticker=trade.ticker,
            quantity=trade.quantity,
            price=trade.buy_price,
            created_at=start + timedelta(days=trade.buy_day, hours=5),
        )
        _add_equity_transaction(
            db,
            user,
            session,
            kind="SELL",
            ticker=trade.ticker,
            quantity=trade.quantity,
            price=trade.sell_price,
            realized_pnl=(trade.sell_price - trade.buy_price) * trade.quantity,
            created_at=start + timedelta(days=trade.sell_day, hours=5),
        )

    for point in spec.snapshots:
        total_value = round(starting_balance * point.value_factor, 2)
        cash_krw = _cash_after_closed_trades(starting_balance, round_trips, point.day)
        db.add(PortfolioSnapshot(
            user_id=user.id,
            game_session_id=session.id,
            total_value_krw=total_value,
            total_holdings_value_krw=round(total_value - cash_krw, 2),
            cash_krw=cash_krw,
            cash_usd=0.0,
            exchange_rate=SEED_RATE,
            created_at=start + timedelta(days=point.day, hours=8),
        ))


def _seed_showcase_games(db: Session, user: User) -> None:
    _seed_dividend_game(db, user)
    for spec in _CLOSED_GAMES:
        _seed_closed_game(db, user, spec)


def seed_demo(db: Session) -> bool:
    """Create or reset the public demo account to its baseline. Runs on every
    boot; returns True when the demo state was (re)built."""
    start = PRIMARY_START

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

    _seed_showcase_games(db, user)

    for ticker, market in _WATCHLIST:
        db.add(Watchlist(user_id=user.id, ticker=ticker, name=_name_for(ticker), market=market))

    db.commit()
    logger.info("Demo account '%s' reset to multi-game showcase baseline", DEMO_USERNAME)
    return True
