from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User
from app.services.exchange_service import get_exchange_rate
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_current_session,
    get_owned_session,
)
from app.services.valuation_service import (
    compute_holdings_value_krw,
    get_infos_for_tickers,
    get_prices_for_tickers,
    resolved_industry,
    resolved_sector,
)

router = APIRouter(tags=["analytics"])


def _ensure_session_cash_for_read(
    db: Session,
    session: GameSession,
    user: User,
) -> GameSession:
    needs_commit = session.cash_krw is None or session.cash_usd is None
    ensure_session_cash_initialized(session, user)
    if needs_commit:
        db.commit()
        db.refresh(session)
    return session


def _session_starting_value_krw(session: GameSession, rate: float) -> float:
    return (session.starting_balance_krw or 0.0) + (
        (session.starting_balance_usd or 0.0) * rate
    )


def _legacy_starting_value_krw(session: GameSession | None) -> float:
    return session.starting_balance_krw if session else 10_000_000


def _has_scoped_rows(db: Session, model, user_id: int, session_id: int) -> bool:
    return (
        db.query(model)
        .filter(model.user_id == user_id, model.game_session_id == session_id)
        .first()
        is not None
    )


def _has_unscoped_rows(db: Session, model, user_id: int) -> bool:
    return (
        db.query(model)
        .filter(model.user_id == user_id, model.game_session_id.is_(None))
        .first()
        is not None
    )


def _read_current_session(db: Session, user: User) -> GameSession | None:
    session = get_current_session(db, user)
    if session:
        _ensure_session_cash_for_read(db, session, user)
    return session


def _use_legacy_rows_for_current_session(
    db: Session,
    models,
    user_id: int,
    session_id: int,
) -> bool:
    has_scoped = any(_has_scoped_rows(db, model, user_id, session_id) for model in models)
    has_unscoped = any(_has_unscoped_rows(db, model, user_id) for model in models)
    return not has_scoped and has_unscoped


def _holdings_query(db: Session, user_id: int, game_session_id: int | None):
    query = db.query(Holding).filter(Holding.user_id == user_id)
    if game_session_id is None:
        return query.filter(Holding.game_session_id.is_(None))
    return query.filter(Holding.game_session_id == game_session_id)


def _transactions_query(db: Session, user_id: int, game_session_id: int | None):
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if game_session_id is None:
        return query.filter(Transaction.game_session_id.is_(None))
    return query.filter(Transaction.game_session_id == game_session_id)


def _snapshots_query(db: Session, user_id: int, game_session_id: int | None):
    query = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id)
    if game_session_id is None:
        return query.filter(PortfolioSnapshot.game_session_id.is_(None))
    return query.filter(PortfolioSnapshot.game_session_id == game_session_id)


def _compat_session_id(
    db: Session,
    user_id: int,
    session: GameSession | None,
    models,
) -> int | None:
    if not session:
        return None
    if _use_legacy_rows_for_current_session(db, models, user_id, session.id):
        return None
    return session.id


def _performance_response(
    *,
    cash_krw: float,
    cash_usd: float,
    holdings: list[Holding],
    snapshots: list[PortfolioSnapshot],
    starting_value: float,
    rate: float,
    limit: int | None,
) -> dict:
    limited_snapshots = snapshots[: max(1, min(limit, 5000))] if limit else snapshots
    prices = get_prices_for_tickers([h.ticker for h in holdings])
    current = cash_krw + (cash_usd * rate) + compute_holdings_value_krw(
        holdings,
        rate,
        prices,
    )
    total_return = current - starting_value
    total_return_pct = (total_return / starting_value) * 100 if starting_value else 0

    return {
        "starting_value": starting_value,
        "current_value": round(current, 2),
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "snapshots": [
            {
                "date": s.created_at.isoformat(),
                "value": round(s.total_value_krw, 2),
                "holdings_value": round(s.total_holdings_value_krw, 2),
                "cash_krw": round(s.cash_krw, 2),
                "cash_usd": round(s.cash_usd, 2),
            }
            for s in limited_snapshots
        ],
    }


def _by_stock_response(
    holdings: list[Holding],
    transactions: list[Transaction],
) -> list[dict]:
    rate = get_exchange_rate()
    tickers = [h.ticker for h in holdings]
    prices = get_prices_for_tickers(tickers)
    infos = get_infos_for_tickers(tickers)

    realized_by_ticker: dict[str, float] = {}
    realized_trades_by_ticker: dict[str, int] = {}
    for t in transactions:
        if t.transaction_type != "SELL":
            continue
        realized_by_ticker[t.ticker] = realized_by_ticker.get(t.ticker, 0.0) + (
            t.realized_pnl or 0.0
        )
        realized_trades_by_ticker[t.ticker] = realized_trades_by_ticker.get(t.ticker, 0) + 1

    results = []
    for h in holdings:
        current_price = prices.get(h.ticker)
        if current_price is None:
            continue

        info = infos.get(h.ticker) or {}
        unrealized_pnl = (current_price - h.avg_price) * h.quantity
        pnl_pct = ((current_price - h.avg_price) / h.avg_price) * 100 if h.avg_price else 0
        total_value = current_price * h.quantity
        total_value_krw = total_value * rate if h.currency == "USD" else total_value

        results.append(
            {
                "ticker": h.ticker,
                "name": h.name,
                "market": h.market,
                "sector": resolved_sector(info, h.sector),
                "industry": resolved_industry(info, h.industry),
                "currency": h.currency,
                "quantity": h.quantity,
                "avg_price": h.avg_price,
                "current_price": current_price,
                "total_value": round(total_value, 2),
                "total_value_krw": round(total_value_krw, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "unrealized_pnl_pct": round(pnl_pct, 2),
                "realized_pnl": round(realized_by_ticker.get(h.ticker, 0.0), 2),
                "realized_trades": realized_trades_by_ticker.get(h.ticker, 0),
            }
        )

    results.sort(key=lambda x: x["unrealized_pnl_pct"], reverse=True)
    return results


def _by_sector_response(holdings: list[Holding]) -> list[dict]:
    rate = get_exchange_rate()
    tickers = [h.ticker for h in holdings]
    prices = get_prices_for_tickers(tickers)
    infos = get_infos_for_tickers(tickers)

    sectors = {}
    for h in holdings:
        current_price = prices.get(h.ticker)
        if current_price is None:
            continue

        total_value = current_price * h.quantity
        total_value_krw = total_value * rate if h.currency == "USD" else total_value
        cost_value = h.avg_price * h.quantity
        cost_value_krw = cost_value * rate if h.currency == "USD" else cost_value
        unrealized_pnl_krw = total_value_krw - cost_value_krw

        info = infos.get(h.ticker) or {}
        sector = resolved_sector(info, h.sector)
        if sector not in sectors:
            sectors[sector] = {
                "total_value_krw": 0,
                "cost_krw": 0,
                "pnl_krw": 0,
                "count": 0,
                "stocks": [],
            }

        sectors[sector]["total_value_krw"] += total_value_krw
        sectors[sector]["cost_krw"] += cost_value_krw
        sectors[sector]["pnl_krw"] += unrealized_pnl_krw
        sectors[sector]["count"] += 1
        sectors[sector]["stocks"].append(h.ticker)

    total_portfolio_krw = sum(s["total_value_krw"] for s in sectors.values())

    results = []
    for name, data in sectors.items():
        pnl_pct = (data["pnl_krw"] / data["cost_krw"] * 100) if data["cost_krw"] else 0
        allocation_pct = (
            (data["total_value_krw"] / total_portfolio_krw * 100)
            if total_portfolio_krw
            else 0
        )
        results.append(
            {
                "sector": name,
                "total_value_krw": round(data["total_value_krw"], 2),
                "pnl_krw": round(data["pnl_krw"], 2),
                "pnl_pct": round(pnl_pct, 2),
                "allocation_pct": round(allocation_pct, 2),
                "stock_count": data["count"],
                "stocks": data["stocks"],
            }
        )

    results.sort(key=lambda x: x["total_value_krw"], reverse=True)
    return results


def _realized_response(transactions: list[Transaction]) -> dict:
    sells = [t for t in transactions if t.transaction_type == "SELL"]
    total_realized = sum(t.realized_pnl or 0.0 for t in sells)
    wins = [t for t in sells if (t.realized_pnl or 0.0) > 0]
    losses = [t for t in sells if (t.realized_pnl or 0.0) < 0]

    return {
        "total_realized_pnl": round(total_realized, 2),
        "total_trades": len(sells),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(len(wins) / len(sells) * 100, 2) if sells else 0,
        "best_trade": (
            {
                "ticker": max(sells, key=lambda t: t.realized_pnl or 0.0).ticker,
                "pnl": max(sells, key=lambda t: t.realized_pnl or 0.0).realized_pnl,
            }
            if sells
            else None
        ),
        "worst_trade": (
            {
                "ticker": min(sells, key=lambda t: t.realized_pnl or 0.0).ticker,
                "pnl": min(sells, key=lambda t: t.realized_pnl or 0.0).realized_pnl,
            }
            if sells
            else None
        ),
    }


@router.get("/game/sessions/{session_id}/analytics/performance")
def get_session_performance(
    session_id: int,
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    _ensure_session_cash_for_read(db, session, current_user)
    rate = get_exchange_rate()
    holdings = _holdings_query(db, current_user.id, session.id).all()
    snapshots = (
        _snapshots_query(db, current_user.id, session.id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )
    return _performance_response(
        cash_krw=session.cash_krw or 0.0,
        cash_usd=session.cash_usd or 0.0,
        holdings=holdings,
        snapshots=snapshots,
        starting_value=_session_starting_value_krw(session, rate),
        rate=rate,
        limit=limit,
    )


@router.get("/analytics/performance")
def get_performance(
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    session = _read_current_session(db, current_user)
    game_session_id = _compat_session_id(
        db,
        user_id,
        session,
        (PortfolioSnapshot, Holding),
    )
    rate = get_exchange_rate()
    holdings = _holdings_query(db, user_id, game_session_id).all()
    snapshots = (
        _snapshots_query(db, user_id, game_session_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )

    if session and game_session_id == session.id:
        cash_krw = session.cash_krw or 0.0
        cash_usd = session.cash_usd or 0.0
        starting_value = _session_starting_value_krw(session, rate)
    else:
        cash_krw = current_user.balance_krw
        cash_usd = current_user.balance_usd
        starting_value = _legacy_starting_value_krw(session)

    return _performance_response(
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        holdings=holdings,
        snapshots=snapshots,
        starting_value=starting_value,
        rate=rate,
        limit=limit,
    )


@router.get("/game/sessions/{session_id}/analytics/by-stock")
def session_performance_by_stock(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    holdings = _holdings_query(db, current_user.id, session.id).all()
    transactions = _transactions_query(db, current_user.id, session.id).all()
    return _by_stock_response(holdings, transactions)


@router.get("/analytics/by-stock")
def performance_by_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _read_current_session(db, current_user)
    game_session_id = _compat_session_id(
        db,
        current_user.id,
        session,
        (Holding, Transaction),
    )
    holdings = _holdings_query(db, current_user.id, game_session_id).all()
    transactions = _transactions_query(db, current_user.id, game_session_id).all()
    return _by_stock_response(holdings, transactions)


@router.get("/game/sessions/{session_id}/analytics/by-sector")
def session_performance_by_sector(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    holdings = _holdings_query(db, current_user.id, session.id).all()
    return _by_sector_response(holdings)


@router.get("/analytics/by-sector")
def performance_by_sector(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _read_current_session(db, current_user)
    game_session_id = _compat_session_id(db, current_user.id, session, (Holding,))
    holdings = _holdings_query(db, current_user.id, game_session_id).all()
    return _by_sector_response(holdings)


@router.get("/game/sessions/{session_id}/analytics/realized")
def session_realized_performance(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    transactions = (
        _transactions_query(db, current_user.id, session.id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    return _realized_response(transactions)


@router.get("/analytics/realized")
def realized_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _read_current_session(db, current_user)
    game_session_id = _compat_session_id(db, current_user.id, session, (Transaction,))
    transactions = (
        _transactions_query(db, current_user.id, game_session_id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    return _realized_response(transactions)
