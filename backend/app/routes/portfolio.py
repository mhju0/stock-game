from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.database import get_db
from app.models import User, Holding, Transaction, PortfolioSnapshot, GameSession
from app.services.stock_service import get_stock_price, get_stock_info # <-- Added get_stock_info
from app.services.exchange_service import get_exchange_rate

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

@router.get("/account")
def get_account(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    rate = get_exchange_rate()
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()

    holdings_value_krw = 0
    holdings_value_usd = 0
    for h in holdings:
        price = get_stock_price(h.ticker)
        if not price:
            continue
        if h.currency == "KRW":
            holdings_value_krw += price * h.quantity
        else:
            holdings_value_usd += price * h.quantity

    total_krw = (
        user.balance_krw
        + (user.balance_usd * rate)
        + holdings_value_krw
        + (holdings_value_usd * rate)
    )

    session = (
        db.query(GameSession)
        .filter(GameSession.user_id == user_id, GameSession.is_active == True)
        .first()
    )
    starting_value = session.starting_balance_krw if session else 10_000_000

    snapshots = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
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

    return {
        "balance_krw": user.balance_krw,
        "balance_usd": user.balance_usd,
        "holdings_value_krw": round(holdings_value_krw, 2),
        "holdings_value_usd": round(holdings_value_usd, 2),
        "holdings_value_total_krw": round(
            holdings_value_krw + (holdings_value_usd * rate), 2
        ),
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

@router.get("/holdings")
def get_holdings(user_id: int, db: Session = Depends(get_db)):
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    result = []
    for h in holdings:
        current_price = get_stock_price(h.ticker)
        # Fetch market cap data
        info = get_stock_info(h.ticker) or {}
        market_cap = info.get("marketCap", 0)
        
        unrealized_pnl = (
            (current_price - h.avg_price) * h.quantity if current_price else 0
        )
        result.append(
            {
                "ticker": h.ticker,
                "name": h.name,
                "market": h.market,
                "sector": h.sector,
                "industry": h.industry,
                "quantity": h.quantity,
                "avg_price": h.avg_price,
                "current_price": current_price,
                "currency": h.currency,
                "unrealized_pnl": round(unrealized_pnl, 2),
                "total_value": (
                    round(current_price * h.quantity, 2) if current_price else 0
                ),
                "market_cap": market_cap, # <-- Added to response
            }
        )
    return result

@router.get("/transactions")
def get_transactions(user_id: int, db: Session = Depends(get_db)):
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
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

@router.get("/snapshots")
def get_snapshots(user_id: int, db: Session = Depends(get_db)):
    snapshots = (
        db.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.user_id == user_id)
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )
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