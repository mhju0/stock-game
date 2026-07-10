import logging

from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import User, Holding, PortfolioSnapshot, GameSession
from app.services.exchange_service import get_exchange_rate
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_current_session,
)

logger = logging.getLogger(__name__)
from app.services.stock_service import get_stock_price
from app.services.valuation_service import (
    compute_holdings_value_krw,
    compute_session_total_value_krw,
)


def get_prices_for_tickers(tickers: list[str]) -> dict[str, float | None]:
    """Snapshot-local price lookup kept patchable for existing tests/callers."""
    unique = list(dict.fromkeys(tickers))
    return {ticker: get_stock_price(ticker) for ticker in unique}


def _create_snapshot(
    db: Session,
    *,
    user_id: int,
    total_value_krw: float,
    total_holdings_value_krw: float,
    cash_krw: float,
    cash_usd: float,
    exchange_rate: float,
    game_session_id: int | None = None,
) -> PortfolioSnapshot:
    snapshot = PortfolioSnapshot(
        user_id=user_id,
        game_session_id=game_session_id,
        total_value_krw=round(total_value_krw, 2),
        total_holdings_value_krw=round(total_holdings_value_krw, 2),
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        exchange_rate=exchange_rate,
    )
    db.add(snapshot)
    db.commit()
    return snapshot


def _take_legacy_user_snapshot(db: Session, user: User) -> PortfolioSnapshot:
    rate = get_exchange_rate()

    holdings = db.query(Holding).filter(Holding.user_id == user.id).all()
    prices = get_prices_for_tickers([h.ticker for h in holdings])
    holdings_value_krw = compute_holdings_value_krw(holdings, rate, prices)
    total_value_krw = user.balance_krw + (user.balance_usd * rate) + holdings_value_krw

    return _create_snapshot(
        db,
        user_id=user.id,
        total_value_krw=total_value_krw,
        total_holdings_value_krw=holdings_value_krw,
        cash_krw=user.balance_krw,
        cash_usd=user.balance_usd,
        exchange_rate=rate,
    )


def _has_unscoped_holdings(db: Session, user_id: int) -> bool:
    return (
        db.query(Holding)
        .filter(Holding.user_id == user_id, Holding.game_session_id.is_(None))
        .first()
        is not None
    )


def take_session_snapshot(db: Session, user_id: int, game_session_id: int) -> PortfolioSnapshot:
    """Create a portfolio snapshot for one game session.

    Session cash is initialized from the legacy User.balance_* fields only when
    GameSession.cash_* is still null. Holdings are scoped by both user_id and
    game_session_id so multiple game sessions cannot bleed into each other.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    session = (
        db.query(GameSession)
        .filter(GameSession.id == game_session_id, GameSession.user_id == user_id)
        .first()
    )
    if not session:
        raise ValueError("Game session not found")

    ensure_session_cash_initialized(session, user)
    rate = get_exchange_rate()

    holdings = (
        db.query(Holding)
        .filter(Holding.user_id == user_id, Holding.game_session_id == game_session_id)
        .all()
    )
    prices = get_prices_for_tickers([h.ticker for h in holdings])
    holdings_value_krw = compute_holdings_value_krw(holdings, rate, prices)
    total_value_krw = compute_session_total_value_krw(session, holdings, rate, prices)

    return _create_snapshot(
        db,
        user_id=user_id,
        game_session_id=game_session_id,
        total_value_krw=total_value_krw,
        total_holdings_value_krw=holdings_value_krw,
        cash_krw=session.cash_krw or 0.0,
        cash_usd=session.cash_usd or 0.0,
        exchange_rate=rate,
    )


def take_snapshot(db: Session, user_id: int) -> PortfolioSnapshot:
    """Compatibility wrapper for existing user-level snapshot callers.

    If the user's active/current session has fully scoped holdings, this writes
    a session-scoped snapshot. If no current session exists, or if old runtime
    paths have created unscoped holdings, it preserves the legacy user-level
    snapshot behavior so existing routes remain compatible during migration.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    session = get_current_session(db, user)
    if session and not _has_unscoped_holdings(db, user_id):
        return take_session_snapshot(db, user_id=user_id, game_session_id=session.id)

    return _take_legacy_user_snapshot(db, user)


def run_snapshot_batch(db: Session) -> int:
    """Snapshot every user's portfolio for the hourly loop.

    Snapshots ALL of a user's active sessions (multi-active-game is supported),
    falling back to the legacy user-level snapshot when a user has no active
    session. Each user is isolated in its own try/except so one failure never
    aborts snapshots for the rest of the batch. Returns the number of users
    snapshotted successfully.
    """
    users = db.query(User).all()
    ok = 0
    for user in users:
        try:
            sessions = (
                db.query(GameSession)
                .filter(
                    GameSession.user_id == user.id,
                    or_(GameSession.is_active.is_(True), GameSession.status == "active"),
                )
                .all()
            )
            if sessions:
                for session in sessions:
                    take_session_snapshot(db, user_id=user.id, game_session_id=session.id)
            else:
                take_snapshot(db, user_id=user.id)
            ok += 1
        except Exception:
            db.rollback()
            logger.warning("Snapshot failed for user %s", user.id, exc_info=True)
    logger.info("Portfolio snapshots saved for %d/%d users", ok, len(users))
    return ok
