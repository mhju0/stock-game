from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Holding, PortfolioSnapshot, Transaction, User
from app.services.exchange_service import get_exchange_rate
from app.services.game_session_service import get_owned_session
from app.services.portfolio_compatibility import (
    ensure_session_cash_for_read,
    holdings_query,
    legacy_starting_value_krw,
    read_current_session,
    resolve_compatibility_session_id,
    session_starting_value_krw,
    snapshots_query,
    transactions_query,
)
from app.services.valuation_service import (
    compute_holdings_value_krw,
    get_infos_for_tickers,
    get_prices_for_tickers,
    resolved_industry,
    resolved_sector,
    valuation_available,
    valuation_fields,
)

from app.services.realized_service import realized_performance as summarize_realized

router = APIRouter(tags=["analytics"])


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
    available = valuation_available(holdings, rate, prices)
    current = (cash_krw + (cash_usd * rate) + compute_holdings_value_krw(holdings, rate, prices)) if available else None
    total_return = current - starting_value if available else None
    total_return_pct = ((total_return / starting_value) * 100 if starting_value else 0) if available else None

    return {
        **valuation_fields(available),
        "starting_value": starting_value,
        "current_value": round(current, 2) if available else None,
        "total_return": round(total_return, 2) if available else None,
        "total_return_pct": round(total_return_pct, 2) if available else None,
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
    if not valuation_available(holdings, rate, prices):
        raise HTTPException(status_code=503, detail="Market prices unavailable")

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
    if not valuation_available(holdings, rate, prices):
        raise HTTPException(status_code=503, detail="Market prices unavailable")

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
    return summarize_realized([t for t in transactions if t.transaction_type == "SELL"])


@router.get("/game/sessions/{session_id}/analytics/performance")
def get_session_performance(
    session_id: int,
    limit: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    ensure_session_cash_for_read(db, session, current_user)
    rate = get_exchange_rate()
    holdings = holdings_query(db, current_user.id, session.id).all()
    snapshots = (
        snapshots_query(db, current_user.id, session.id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )
    return _performance_response(
        cash_krw=session.cash_krw or 0.0,
        cash_usd=session.cash_usd or 0.0,
        holdings=holdings,
        snapshots=snapshots,
        starting_value=session_starting_value_krw(session, rate),
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
    session = read_current_session(db, current_user)
    game_session_id = resolve_compatibility_session_id(
        db,
        user_id,
        session,
        (PortfolioSnapshot, Holding),
    )
    rate = get_exchange_rate()
    holdings = holdings_query(db, user_id, game_session_id).all()
    snapshots = (
        snapshots_query(db, user_id, game_session_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )

    if session and game_session_id == session.id:
        cash_krw = session.cash_krw or 0.0
        cash_usd = session.cash_usd or 0.0
        starting_value = session_starting_value_krw(session, rate)
    else:
        cash_krw = current_user.balance_krw
        cash_usd = current_user.balance_usd
        starting_value = legacy_starting_value_krw(session)

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
    holdings = holdings_query(db, current_user.id, session.id).all()
    transactions = transactions_query(db, current_user.id, session.id).all()
    return _by_stock_response(holdings, transactions)


@router.get("/analytics/by-stock")
def performance_by_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = read_current_session(db, current_user)
    game_session_id = resolve_compatibility_session_id(
        db,
        current_user.id,
        session,
        (Holding, Transaction),
    )
    holdings = holdings_query(db, current_user.id, game_session_id).all()
    transactions = transactions_query(db, current_user.id, game_session_id).all()
    return _by_stock_response(holdings, transactions)


@router.get("/game/sessions/{session_id}/analytics/by-sector")
def session_performance_by_sector(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    holdings = holdings_query(db, current_user.id, session.id).all()
    return _by_sector_response(holdings)


@router.get("/analytics/by-sector")
def performance_by_sector(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = read_current_session(db, current_user)
    game_session_id = resolve_compatibility_session_id(
        db,
        current_user.id,
        session,
        (Holding,),
    )
    holdings = holdings_query(db, current_user.id, game_session_id).all()
    return _by_sector_response(holdings)


@router.get("/game/sessions/{session_id}/analytics/realized")
def session_realized_performance(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    transactions = (
        transactions_query(db, current_user.id, session.id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    return _realized_response(transactions)


@router.get("/analytics/realized")
def realized_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = read_current_session(db, current_user)
    game_session_id = resolve_compatibility_session_id(
        db,
        current_user.id,
        session,
        (Transaction,),
    )
    transactions = (
        transactions_query(db, current_user.id, game_session_id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    return _realized_response(transactions)
