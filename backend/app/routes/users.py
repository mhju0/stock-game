from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from app.database import get_db
from app.models import User, Holding, Transaction, Watchlist, PortfolioSnapshot, GameSession
from app.services.snapshot_service import take_snapshot
from app.services.exchange_service import get_exchange_rate
from app.services.valuation_service import get_prices_for_tickers, compute_user_total_value_krw

router = APIRouter(tags=["users"])


class GameCreate(BaseModel):
    name: str
    starting_currency: str = "KRW"  # "KRW" or "USD"
    starting_balance_krw: float = 10_000_000
    starting_balance_usd: float = 0.0
    duration_days: int = 90


@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    """Return all games with their current status."""
    users = db.query(User).all()
    results = []
    rate = get_exchange_rate()
    sessions = db.query(GameSession).filter(GameSession.is_active == True).all()
    sessions_by_user = {s.user_id: s for s in sessions}
    all_holdings = db.query(Holding).all()
    holdings_by_user: dict[int, list[Holding]] = {}
    for h in all_holdings:
        holdings_by_user.setdefault(h.user_id, []).append(h)
    prices = get_prices_for_tickers([h.ticker for h in all_holdings])

    for u in users:
        session = sessions_by_user.get(u.id)
        holdings = holdings_by_user.get(u.id, [])
        total_value = compute_user_total_value_krw(u, holdings, rate, prices)
        starting = session.starting_balance_krw if session else 10_000_000
        return_pct = ((total_value - starting) / starting) * 100 if starting else 0

        now = datetime.now(timezone.utc)
        days_remaining = None
        days_elapsed = None
        is_expired = False
        if session:
            end_date = session.end_date.replace(tzinfo=timezone.utc) if session.end_date.tzinfo is None else session.end_date
            start_date = session.start_date.replace(tzinfo=timezone.utc) if session.start_date.tzinfo is None else session.start_date
            remaining_secs = (end_date - now).total_seconds()
            days_remaining = max(0, remaining_secs / 86400)
            days_elapsed = (now - start_date).total_seconds() / 86400
            is_expired = remaining_secs <= 0

        results.append({
            "id": u.id,
            "username": u.username,
            "balance_krw": u.balance_krw,
            "total_value_krw": round(total_value, 2),
            "return_pct": round(return_pct, 2),
            "starting_balance_krw": starting,
            "duration_days": session.duration_days if session else None,
            "days_remaining": round(days_remaining, 1) if days_remaining is not None else None,
            "days_elapsed": round(days_elapsed, 1) if days_elapsed is not None else None,
            "is_expired": is_expired,
            "holdings_count": len(holdings),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return results


@router.post("/users/new")
def create_game(game_data: GameCreate, db: Session = Depends(get_db)):
    """Create a new game (user + game session) in one step."""
    existing = db.query(User).filter(User.username == game_data.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="A game with this name already exists")

    rate = get_exchange_rate()

    starting_currency = (game_data.starting_currency or "KRW").upper()
    starting_balance_usd = float(game_data.starting_balance_usd or 0.0)
    starting_balance_krw = float(game_data.starting_balance_krw or 0.0)

    # Create user with the starting balance
    # Note: we always keep `GameSession.starting_balance_krw` in KRW terms so all existing
    # return/analytics math (which is KRW-based) stays consistent.
    is_usd_start = starting_currency == "USD" or starting_balance_usd > 0

    if is_usd_start:
        user_balance_krw = 0.0
        user_balance_usd = starting_balance_usd
        session_starting_balance_usd = starting_balance_usd
        session_starting_balance_krw = starting_balance_usd * rate
    else:
        user_balance_krw = starting_balance_krw
        user_balance_usd = 0.0
        session_starting_balance_usd = 0.0
        session_starting_balance_krw = starting_balance_krw

    new_user = User(
        username=game_data.name,
        balance_krw=user_balance_krw,
        balance_usd=user_balance_usd,
    )
    db.add(new_user)
    db.flush()  # Get the ID without committing

    # Create game session automatically
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=new_user.id,
        starting_balance_krw=session_starting_balance_krw,
        starting_balance_usd=session_starting_balance_usd,
        duration_days=game_data.duration_days,
        start_date=now,
        end_date=now + timedelta(days=game_data.duration_days),
        is_active=True,
    )
    db.add(session)
    db.commit()
    db.refresh(new_user)

    # Take initial snapshot
    take_snapshot(db, user_id=new_user.id)

    return {"id": new_user.id, "username": new_user.username}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(Holding).filter(Holding.user_id == user_id).delete()
    db.query(Transaction).filter(Transaction.user_id == user_id).delete()
    db.query(Watchlist).filter(Watchlist.user_id == user_id).delete()
    db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete()
    db.query(GameSession).filter(GameSession.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"status": "success"}
