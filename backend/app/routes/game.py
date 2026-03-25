from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.services.exchange_service import get_exchange_rate
from app.database import get_db
from app.models import (
    User,
    Holding,
    Transaction,
    Watchlist,
    PortfolioSnapshot,
    GameSession,
)
from app.services.benchmark_service import get_benchmark_data
from app.services.snapshot_service import take_snapshot
from app.services.valuation_service import get_prices_for_tickers, compute_user_total_value_krw

router = APIRouter(prefix="/game", tags=["game"])

class NewGameRequest(BaseModel):
    starting_balance_krw: float = 10_000_000
    duration_days: int = 90

@router.post("/new")
def start_new_game(request: NewGameRequest, user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()

    active_session = (
        db.query(GameSession)
        .filter(GameSession.user_id == user_id, GameSession.is_active == True)
        .first()
    )

    if active_session:
        active_session.is_active = False
        active_session.final_value_krw = user.balance_krw
        active_session.final_return_pct = (
            (user.balance_krw - active_session.starting_balance_krw)
            / active_session.starting_balance_krw
            * 100
        )

    db.query(Holding).filter(Holding.user_id == user_id).delete()
    db.query(Transaction).filter(Transaction.user_id == user_id).delete()
    db.query(Watchlist).filter(Watchlist.user_id == user_id).delete()
    db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete()

    user.balance_krw = request.starting_balance_krw
    user.balance_usd = 0.0

    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user_id,
        starting_balance_krw=request.starting_balance_krw,
        starting_balance_usd=0.0,
        duration_days=request.duration_days,
        start_date=now,
        end_date=now + timedelta(days=request.duration_days),
        is_active=True,
    )
    db.add(session)
    db.commit()

    take_snapshot(db, user_id=user_id)

    return {
        "status": "success",
        "session": {
            "id": session.id,
            "starting_balance_krw": session.starting_balance_krw,
            "duration_days": session.duration_days,
            "start_date": session.start_date.isoformat(),
            "end_date": session.end_date.isoformat(),
        },
    }

@router.get("/status")
def game_status(user_id: int, db: Session = Depends(get_db)):
    session = (
        db.query(GameSession)
        .filter(GameSession.user_id == user_id, GameSession.is_active == True)
        .first()
    )

    if not session:
        return {"active": False}

    now = datetime.now(timezone.utc)
    end_date = (
        session.end_date.replace(tzinfo=timezone.utc)
        if session.end_date.tzinfo is None
        else session.end_date
    )
    start_date = (
        session.start_date.replace(tzinfo=timezone.utc)
        if session.start_date.tzinfo is None
        else session.start_date
    )

    remaining = (end_date - now).total_seconds()
    days_remaining = max(0, remaining / 86400)
    days_elapsed = session.duration_days - days_remaining

    user = db.query(User).filter(User.id == user_id).first()
    snapshots = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.created_at.desc())
        .first()
    )

    current_value = (
        snapshots.total_value_krw if snapshots else session.starting_balance_krw
    )
    current_return = (
        (current_value - session.starting_balance_krw) / session.starting_balance_krw
    ) * 100

    return {
        "active": True,
        "session_id": session.id,
        "starting_balance_krw": session.starting_balance_krw,
        "current_value_krw": round(current_value, 2),
        "current_return_pct": round(current_return, 2),
        "duration_days": session.duration_days,
        "days_elapsed": round(days_elapsed, 1),
        "days_remaining": round(days_remaining, 1),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "is_expired": remaining <= 0,
    }

@router.get("/history")
def game_history(user_id: int, limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    sessions = (
        db.query(GameSession)
        .filter(GameSession.user_id == user_id, GameSession.is_active == False)
        .order_by(GameSession.start_date.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 1000)))
        .all()
    )

    return [
        {
            "id": s.id,
            "starting_balance_krw": s.starting_balance_krw,
            "final_value_krw": s.final_value_krw,
            "final_return_pct": s.final_return_pct,
            "duration_days": s.duration_days,
            "start_date": s.start_date.isoformat(),
            "end_date": s.end_date.isoformat(),
        }
        for s in sessions
    ]

@router.get("/benchmark/{index}")
def benchmark(index: str, days: int = 90):
    # Benchmark doesn't need user_id as it just fetches public market data
    data = get_benchmark_data(index, days)
    if not data:
        return {"error": "Could not fetch benchmark data"}
    return data

@router.get("/summary")
def game_summary(user_id: int, db: Session = Depends(get_db)):
    session = (
        db.query(GameSession)
        .filter(GameSession.user_id == user_id, GameSession.is_active == True)
        .first()
    )

    if not session:
        return {"active": False}

    from app.models import Transaction, Holding, PortfolioSnapshot

    user = db.query(User).filter(User.id == user_id).first()
    rate = get_exchange_rate()

    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    prices = get_prices_for_tickers([h.ticker for h in holdings])
    current_value = compute_user_total_value_krw(user, holdings, rate, prices)
    total_return = current_value - session.starting_balance_krw
    total_return_pct = (total_return / session.starting_balance_krw) * 100

    all_transactions = db.query(Transaction).filter(Transaction.user_id == user_id).all()

    buys = [t for t in all_transactions if t.transaction_type == "BUY"]
    sells = [t for t in all_transactions if t.transaction_type == "SELL"]
    exchanges = [t for t in all_transactions if t.transaction_type == "EXCHANGE"]

    total_realized = sum(t.realized_pnl for t in sells)
    wins = [t for t in sells if t.realized_pnl > 0]
    losses = [t for t in sells if t.realized_pnl < 0]

    best_trade = max(sells, key=lambda t: t.realized_pnl) if sells else None
    worst_trade = min(sells, key=lambda t: t.realized_pnl) if sells else None

    most_traded_tickers = {}
    for t in all_transactions:
        if t.transaction_type in ("BUY", "SELL"):
            most_traded_tickers[t.ticker] = most_traded_tickers.get(t.ticker, 0) + 1
    most_traded = (
        max(most_traded_tickers, key=most_traded_tickers.get)
        if most_traded_tickers
        else None
    )

    sectors = {}
    for h in holdings:
        price = prices.get(h.ticker)
        if not price:
            continue
        val = price * h.quantity
        if h.currency == "USD":
            val *= rate
        s = h.sector or "Unknown"
        sectors[s] = sectors.get(s, 0) + val

    snapshots = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )

    peak_value = max(
        (s.total_value_krw for s in snapshots), default=session.starting_balance_krw
    )
    trough_value = min(
        (s.total_value_krw for s in snapshots), default=session.starting_balance_krw
    )

    now = datetime.now(timezone.utc)
    end_date = (
        session.end_date.replace(tzinfo=timezone.utc)
        if session.end_date.tzinfo is None
        else session.end_date
    )
    start_date = (
        session.start_date.replace(tzinfo=timezone.utc)
        if session.start_date.tzinfo is None
        else session.start_date
    )
    days_elapsed = (now - start_date).total_seconds() / 86400

    return {
        "active": True,
        "starting_balance": session.starting_balance_krw,
        "current_value": round(current_value, 2),
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "duration_days": session.duration_days,
        "days_elapsed": round(days_elapsed, 1),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "is_expired": (end_date - now).total_seconds() <= 0,
        "total_trades": len(buys) + len(sells),
        "total_buys": len(buys),
        "total_sells": len(sells),
        "total_exchanges": len(exchanges),
        "realized_pnl": round(total_realized, 2),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(len(wins) / len(sells) * 100, 2) if sells else 0,
        "best_trade": (
            {
                "ticker": best_trade.ticker,
                "name": best_trade.name,
                "pnl": best_trade.realized_pnl,
            }
            if best_trade
            else None
        ),
        "worst_trade": (
            {
                "ticker": worst_trade.ticker,
                "name": worst_trade.name,
                "pnl": worst_trade.realized_pnl,
            }
            if worst_trade
            else None
        ),
        "most_traded": most_traded,
        "current_holdings_count": len(holdings),
        "sectors": sectors,
        "peak_value": round(peak_value, 2),
        "trough_value": round(trough_value, 2),
        "cash_krw": user.balance_krw,
        "cash_usd": user.balance_usd,
    }