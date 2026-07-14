from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
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
    get_infos_for_tickers,
    get_prices_for_tickers,
    resolved_industry,
    resolved_sector,
)

router = APIRouter(tags=["portfolio"])


def _format_holdings(holdings: list[Holding]) -> list[dict]:
    tickers = [h.ticker for h in holdings]
    prices = get_prices_for_tickers(tickers)
    infos = get_infos_for_tickers(tickers)
    result = []
    for h in holdings:
        current_price = prices.get(h.ticker)
        info = infos.get(h.ticker) or {}
        unrealized_pnl = (
            (current_price - h.avg_price) * h.quantity
            if current_price is not None
            else 0
        )
        result.append(
            {
                "ticker": h.ticker,
                "name": h.name,
                "market": h.market,
                "sector": resolved_sector(info, h.sector),
                "industry": resolved_industry(info, h.industry),
                "quantity": h.quantity,
                "avg_price": h.avg_price,
                "current_price": current_price,
                "currency": h.currency,
                "unrealized_pnl": round(unrealized_pnl, 2),
                "total_value": (
                    round(current_price * h.quantity, 2)
                    if current_price is not None
                    else 0
                ),
            }
        )
    return result


def _format_transactions(transactions: list[Transaction]) -> list[dict]:
    return [
        {
            "id": t.id,
            "ticker": t.ticker,
            "name": t.name,
            "market": t.market,
            "transaction_type": t.transaction_type,
            "quantity": t.quantity,
            "price": t.price,
            "currency": t.currency,
            "sector": t.sector,
            "industry": t.industry,
            "total_amount": t.total_amount,
            "realized_pnl": t.realized_pnl,
            "created_at": t.created_at.isoformat(),
        }
        for t in transactions
    ]


def _format_snapshots(snapshots: list[PortfolioSnapshot]) -> list[dict]:
    return [
        {
            "total_value_krw": s.total_value_krw,
            "total_holdings_value_krw": s.total_holdings_value_krw,
            "cash_krw": s.cash_krw,
            "cash_usd": s.cash_usd,
            "exchange_rate": s.exchange_rate,
            "created_at": s.created_at.isoformat(),
        }
        for s in snapshots
    ]


def _build_account_response(
    *,
    cash_krw: float,
    cash_usd: float,
    holdings: list[Holding],
    snapshots: list[PortfolioSnapshot],
    starting_value: float,
    rate: float,
) -> dict:
    prices = get_prices_for_tickers([h.ticker for h in holdings])

    holdings_value_krw = 0.0
    holdings_value_usd = 0.0
    for h in holdings:
        price = prices.get(h.ticker)
        if price is None:
            continue
        if h.currency == "KRW":
            holdings_value_krw += price * h.quantity
        else:
            holdings_value_usd += price * h.quantity

    total_krw = cash_krw + (cash_usd * rate) + holdings_value_krw + (
        holdings_value_usd * rate
    )

    def get_value_at(days_ago):
        if not snapshots:
            return None
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_ago)
        for s in snapshots:
            s_date = (
                s.created_at.replace(tzinfo=timezone.utc)
                if s.created_at.tzinfo is None
                else s.created_at
            )
            if s_date >= cutoff:
                return s.total_value_krw
        return snapshots[-1].total_value_krw if snapshots else None

    def calc_change(past_value):
        if past_value is None or past_value == 0:
            return None
        return round(((total_krw - past_value) / past_value) * 100, 2)

    def calc_change_amount(past_value):
        if past_value is None:
            return None
        return round(total_krw - past_value, 2)

    week_val = get_value_at(7)
    month_val = get_value_at(30)
    year_val = get_value_at(365)

    prev_snapshot = None
    if len(snapshots) >= 2:
        today = datetime.now(timezone.utc).date()
        for s in reversed(snapshots):
            s_date = (
                s.created_at.replace(tzinfo=timezone.utc)
                if s.created_at.tzinfo is None
                else s.created_at
            )
            if s_date.date() < today:
                prev_snapshot = s
                break
    daily_prev = prev_snapshot.total_value_krw if prev_snapshot else starting_value

    holdings_value_total_krw = holdings_value_krw + (holdings_value_usd * rate)

    return {
        "balance_krw": cash_krw,
        "balance_usd": cash_usd,
        "holdings_value_krw": round(holdings_value_krw, 2),
        "holdings_value_usd": round(holdings_value_usd, 2),
        "holdings_value_total_krw": round(holdings_value_total_krw, 2),
        "total_value_krw": round(total_krw, 2),
        "exchange_rate": rate,
        "starting_value": starting_value,
        "total_return_pct": (
            round(((total_krw - starting_value) / starting_value) * 100, 2)
            if starting_value
            else 0
        ),
        "daily_change_krw": round(total_krw - daily_prev, 2),
        "daily_change_pct": (
            round(((total_krw - daily_prev) / daily_prev) * 100, 2) if daily_prev else 0
        ),
        "change_1w": calc_change(week_val),
        "change_1w_krw": calc_change_amount(week_val),
        "change_1m": calc_change(month_val),
        "change_1m_krw": calc_change_amount(month_val),
        "change_1y": calc_change(year_val),
        "change_1y_krw": calc_change_amount(year_val),
        "change_all": (
            round(((total_krw - starting_value) / starting_value) * 100, 2)
            if starting_value
            else 0
        ),
        "change_all_krw": round(total_krw - starting_value, 2),
    }


@router.get("/game/sessions/{session_id}/portfolio/account")
def get_session_account(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    ensure_session_cash_for_read(db, session, current_user)
    rate = get_exchange_rate()
    holdings = holdings_query(db, current_user.id, session.id).all()
    snapshots = snapshots_query(db, current_user.id, session.id).order_by(
        PortfolioSnapshot.created_at.asc()
    ).all()
    return _build_account_response(
        cash_krw=session.cash_krw or 0.0,
        cash_usd=session.cash_usd or 0.0,
        holdings=holdings,
        snapshots=snapshots,
        starting_value=session_starting_value_krw(session, rate),
        rate=rate,
    )


@router.get("/portfolio/account")
def get_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    session = read_current_session(db, current_user)
    game_session_id = resolve_compatibility_session_id(
        db,
        user_id,
        session,
        (Holding,),
    )
    holdings = holdings_query(db, user_id, game_session_id).all()
    snapshots = (
        snapshots_query(db, user_id, game_session_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )
    rate = get_exchange_rate()

    if session and game_session_id == session.id:
        cash_krw = session.cash_krw or 0.0
        cash_usd = session.cash_usd or 0.0
        starting_value = session_starting_value_krw(session, rate)
    else:
        cash_krw = current_user.balance_krw
        cash_usd = current_user.balance_usd
        starting_value = legacy_starting_value_krw(session)

    return _build_account_response(
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        holdings=holdings,
        snapshots=snapshots,
        starting_value=starting_value,
        rate=rate,
    )


@router.get("/game/sessions/{session_id}/portfolio/holdings")
def get_session_holdings(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    holdings = holdings_query(db, current_user.id, session.id).all()
    return _format_holdings(holdings)


@router.get("/portfolio/holdings")
def get_holdings(
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
    return _format_holdings(holdings)


@router.get("/game/sessions/{session_id}/portfolio/transactions")
def get_session_transactions(
    session_id: int,
    limit: int = 200,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    transactions = (
        transactions_query(db, current_user.id, session.id)
        .order_by(Transaction.created_at.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 1000)))
        .all()
    )
    return _format_transactions(transactions)


@router.get("/portfolio/transactions")
def get_transactions(
    limit: int = 200,
    offset: int = 0,
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
        .offset(max(0, offset))
        .limit(max(1, min(limit, 1000)))
        .all()
    )
    return _format_transactions(transactions)


@router.get("/game/sessions/{session_id}/portfolio/snapshots")
def get_session_snapshots(
    session_id: int,
    limit: int = 500,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    snapshots = (
        snapshots_query(db, current_user.id, session.id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 5000)))
        .all()
    )
    return _format_snapshots(snapshots)


@router.get("/portfolio/snapshots")
def get_snapshots(
    limit: int = 500,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = read_current_session(db, current_user)
    game_session_id = resolve_compatibility_session_id(
        db,
        current_user.id,
        session,
        (PortfolioSnapshot,),
    )
    snapshots = (
        snapshots_query(db, current_user.id, game_session_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 5000)))
        .all()
    )
    return _format_snapshots(snapshots)
