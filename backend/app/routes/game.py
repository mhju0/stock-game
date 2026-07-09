from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User
from app.schemas import GameSessionCreateRequest, GameSessionUpdateRequest, NewGameRequest
from app.services.benchmark_service import get_benchmark_data
from app.services.exchange_service import get_exchange_rate
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_current_session,
    get_owned_session,
)
from app.services.valuation_service import (
    compute_session_total_value_krw,
    get_infos_for_tickers,
    get_prices_for_tickers,
    resolved_sector,
)

router = APIRouter(prefix="/game", tags=["game"])


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    aware = _as_aware_utc(value)
    return aware.isoformat() if aware else None


def _is_expired(session: GameSession, now: datetime | None = None) -> bool:
    end_date = _as_aware_utc(session.end_date)
    if end_date is None:
        return False
    return end_date <= (now or datetime.now(timezone.utc))


def _effective_status(session: GameSession, now: datetime | None = None) -> str:
    status = (session.status or "").lower()
    if status in {"completed", "archived"}:
        return status
    if _is_expired(session, now):
        return "expired"
    if status:
        return status
    return "active" if session.is_active else "completed"


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


def _session_holdings(db: Session, user_id: int, session_id: int) -> list[Holding]:
    return (
        db.query(Holding)
        .filter(Holding.user_id == user_id, Holding.game_session_id == session_id)
        .all()
    )


def _session_transactions(db: Session, user_id: int, session_id: int) -> list[Transaction]:
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == user_id, Transaction.game_session_id == session_id)
        .all()
    )


def _session_snapshots(
    db: Session,
    user_id: int,
    session_id: int,
) -> list[PortfolioSnapshot]:
    return (
        db.query(PortfolioSnapshot)
        .filter(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.game_session_id == session_id,
        )
        .order_by(PortfolioSnapshot.created_at.asc())
        .all()
    )


def _session_current_value_krw(
    session: GameSession,
    holdings: list[Holding],
    rate: float,
) -> float:
    prices = get_prices_for_tickers([h.ticker for h in holdings])
    return compute_session_total_value_krw(session, holdings, rate, prices)


def _latest_session_snapshot(
    db: Session,
    user_id: int,
    session_id: int,
) -> PortfolioSnapshot | None:
    return (
        db.query(PortfolioSnapshot)
        .filter(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.game_session_id == session_id,
        )
        .order_by(PortfolioSnapshot.created_at.desc())
        .first()
    )


def _create_session(
    db: Session,
    user: User,
    *,
    title: str | None,
    duration_days: int,
    starting_balance_krw: float,
    starting_balance_usd: float = 0.0,
) -> GameSession:
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id,
        title=title or "Trading Simulation",
        status="active",
        starting_balance_krw=starting_balance_krw,
        starting_balance_usd=starting_balance_usd,
        cash_krw=starting_balance_krw,
        cash_usd=starting_balance_usd,
        duration_days=duration_days,
        start_date=now,
        end_date=now + timedelta(days=duration_days),
        is_active=True,
    )
    db.add(session)

    # Legacy mirror for old routes that still read User.balance_* during migration.
    user.balance_krw = starting_balance_krw
    user.balance_usd = starting_balance_usd

    db.commit()
    db.refresh(session)
    db.refresh(user)
    return session


def _request_updates(request) -> dict:
    if hasattr(request, "model_dump"):
        return request.model_dump(exclude_unset=True)
    return request.dict(exclude_unset=True)


def _serialize_session(db: Session, user: User, session: GameSession) -> dict:
    _ensure_session_cash_for_read(db, session, user)
    rate = get_exchange_rate()
    holdings = _session_holdings(db, user.id, session.id)
    current_value = _session_current_value_krw(session, holdings, rate)
    starting_value = _session_starting_value_krw(session, rate)
    latest_snapshot = _latest_session_snapshot(db, user.id, session.id)
    start_date = _as_aware_utc(session.start_date)
    end_date = _as_aware_utc(session.end_date)
    last_updated = (
        latest_snapshot.created_at
        if latest_snapshot
        else session.updated_at or session.created_at or session.start_date
    )

    return {
        "id": session.id,
        "title": session.title,
        "status": _effective_status(session),
        "is_active": bool(session.is_active),
        "is_expired": _is_expired(session),
        "starting_balance_krw": session.starting_balance_krw,
        "starting_balance_usd": session.starting_balance_usd or 0.0,
        "cash_krw": session.cash_krw or 0.0,
        "cash_usd": session.cash_usd or 0.0,
        "current_value_krw": round(current_value, 2),
        "current_return_pct": (
            round(((current_value - starting_value) / starting_value) * 100, 2)
            if starting_value
            else 0
        ),
        "duration_days": session.duration_days,
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "last_updated_at": _iso(last_updated),
        "created_at": _iso(session.created_at),
        "updated_at": _iso(session.updated_at),
        "completed_at": _iso(session.completed_at),
    }


def _build_session_status(db: Session, user: User, session: GameSession) -> dict:
    _ensure_session_cash_for_read(db, session, user)
    now = datetime.now(timezone.utc)
    start_date = _as_aware_utc(session.start_date)
    end_date = _as_aware_utc(session.end_date)
    remaining = (end_date - now).total_seconds() if end_date else 0
    days_remaining = max(0, remaining / 86400)
    days_elapsed = (
        (now - start_date).total_seconds() / 86400
        if start_date
        else session.duration_days - days_remaining
    )
    rate = get_exchange_rate()
    holdings = _session_holdings(db, user.id, session.id)
    current_value = _session_current_value_krw(session, holdings, rate)
    starting_value = _session_starting_value_krw(session, rate)

    return {
        "active": _effective_status(session, now) == "active",
        "session_id": session.id,
        "title": session.title,
        "status": _effective_status(session, now),
        "starting_balance_krw": session.starting_balance_krw,
        "starting_balance_usd": session.starting_balance_usd or 0.0,
        "cash_krw": session.cash_krw or 0.0,
        "cash_usd": session.cash_usd or 0.0,
        "current_value_krw": round(current_value, 2),
        "current_return_pct": (
            round(((current_value - starting_value) / starting_value) * 100, 2)
            if starting_value
            else 0
        ),
        "duration_days": session.duration_days,
        "days_elapsed": round(days_elapsed, 1),
        "days_remaining": round(days_remaining, 1),
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "is_expired": remaining <= 0,
    }


def _build_session_summary(db: Session, user: User, session: GameSession) -> dict:
    _ensure_session_cash_for_read(db, session, user)
    user_id = user.id
    rate = get_exchange_rate()
    holdings = _session_holdings(db, user_id, session.id)
    tickers = [h.ticker for h in holdings]
    prices = get_prices_for_tickers(tickers)
    infos = get_infos_for_tickers(tickers)
    current_value = compute_session_total_value_krw(session, holdings, rate, prices)
    starting_value = _session_starting_value_krw(session, rate)
    total_return = current_value - starting_value
    total_return_pct = (total_return / starting_value) * 100 if starting_value else 0

    all_transactions = _session_transactions(db, user_id, session.id)
    buys = [t for t in all_transactions if t.transaction_type == "BUY"]
    sells = [t for t in all_transactions if t.transaction_type == "SELL"]
    exchanges = [t for t in all_transactions if t.transaction_type == "EXCHANGE"]

    total_realized = sum(t.realized_pnl or 0.0 for t in sells)
    wins = [t for t in sells if (t.realized_pnl or 0.0) > 0]
    losses = [t for t in sells if (t.realized_pnl or 0.0) < 0]

    best_trade = max(sells, key=lambda t: t.realized_pnl or 0.0) if sells else None
    worst_trade = min(sells, key=lambda t: t.realized_pnl or 0.0) if sells else None

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
        if price is None:
            continue
        value = price * h.quantity
        if h.currency == "USD":
            value *= rate
        info = infos.get(h.ticker) or {}
        sector = resolved_sector(info, h.sector)
        sectors[sector] = sectors.get(sector, 0) + value

    snapshots = _session_snapshots(db, user_id, session.id)
    peak_value = max(
        (s.total_value_krw for s in snapshots),
        default=starting_value,
    )
    trough_value = min(
        (s.total_value_krw for s in snapshots),
        default=starting_value,
    )

    now = datetime.now(timezone.utc)
    start_date = _as_aware_utc(session.start_date)
    end_date = _as_aware_utc(session.end_date)
    days_elapsed = (now - start_date).total_seconds() / 86400 if start_date else 0

    return {
        "active": _effective_status(session, now) == "active",
        "session_id": session.id,
        "title": session.title,
        "status": _effective_status(session, now),
        "starting_balance": session.starting_balance_krw,
        "starting_balance_krw": session.starting_balance_krw,
        "starting_balance_usd": session.starting_balance_usd or 0.0,
        "current_value": round(current_value, 2),
        "current_value_krw": round(current_value, 2),
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "duration_days": session.duration_days,
        "days_elapsed": round(days_elapsed, 1),
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "is_expired": _is_expired(session, now),
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
        "cash_krw": session.cash_krw or 0.0,
        "cash_usd": session.cash_usd or 0.0,
    }


@router.get("/sessions")
def game_sessions(
    include_all: bool = False,
    include_completed: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Backward compatibility: the current frontend treats this endpoint as the
    # playable sessions list. Full session history is opt-in until the frontend
    # is session-routed and can represent completed/archived/imported sessions.
    sessions = (
        db.query(GameSession)
        .filter(GameSession.user_id == current_user.id)
        .order_by(GameSession.start_date.desc(), GameSession.id.desc())
        .all()
    )
    if not include_all and not include_completed:
        sessions = [
            session
            for session in sessions
            if _effective_status(session) == "active" and bool(session.is_active)
        ]
    return {
        "sessions": [
            _serialize_session(db, current_user, session) for session in sessions
        ]
    }


@router.post("/sessions")
def create_game_session(
    request: GameSessionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _create_session(
        db,
        current_user,
        title=request.title,
        duration_days=request.duration_days,
        starting_balance_krw=request.starting_balance_krw,
        starting_balance_usd=request.starting_balance_usd,
    )
    return {"status": "success", "session": _serialize_session(db, current_user, session)}


@router.get("/sessions/{session_id}")
def get_game_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    return {"session": _serialize_session(db, current_user, session)}


@router.patch("/sessions/{session_id}")
def update_game_session(
    session_id: int,
    request: GameSessionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    updates = _request_updates(request)

    if "title" in updates:
        title = (request.title or "").strip()
        session.title = title[:80] or "Trading Simulation"

    if "status" in updates:
        status = (request.status or "").strip().lower()
        if status not in {"active", "completed", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid game session status")

        session.status = status
        if status == "active":
            session.is_active = True
            session.completed_at = None
        else:
            session.is_active = False
            if session.completed_at is None:
                session.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)
    return {"status": "success", "session": _serialize_session(db, current_user, session)}


@router.delete("/sessions/{session_id}")
def delete_game_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    scoped_filter = {
        "user_id": current_user.id,
        "game_session_id": session.id,
    }

    db.query(Holding).filter_by(**scoped_filter).delete(synchronize_session=False)
    db.query(Transaction).filter_by(**scoped_filter).delete(synchronize_session=False)
    db.query(PortfolioSnapshot).filter_by(**scoped_filter).delete(synchronize_session=False)
    db.delete(session)
    db.commit()

    return {"status": "success", "deleted_session_id": session_id}


@router.get("/sessions/{session_id}/status")
def get_game_session_status(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    return _build_session_status(db, current_user, session)


@router.get("/sessions/{session_id}/summary")
def get_game_session_summary(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    return _build_session_summary(db, current_user, session)


@router.post("/new")
def start_new_game(
    request: NewGameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Compatibility alias for the current frontend. It no longer resets data;
    # frontend copy should be updated before presenting it as a restart action.
    session = _create_session(
        db,
        current_user,
        title="Trading Simulation",
        duration_days=request.duration_days,
        starting_balance_krw=request.starting_balance_krw,
        starting_balance_usd=0.0,
    )
    return {
        "status": "success",
        "session": {
            "id": session.id,
            "title": session.title,
            "status": _effective_status(session),
            "starting_balance_krw": session.starting_balance_krw,
            "starting_balance_usd": session.starting_balance_usd or 0.0,
            "cash_krw": session.cash_krw or 0.0,
            "cash_usd": session.cash_usd or 0.0,
            "duration_days": session.duration_days,
            "start_date": session.start_date.isoformat(),
            "end_date": session.end_date.isoformat(),
        },
    }


@router.get("/status")
def game_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_current_session(db, current_user)
    if not session:
        return {"active": False}
    return _build_session_status(db, current_user, session)


@router.get("/history")
def game_history(
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        db.query(GameSession)
        .filter(GameSession.user_id == current_user.id, GameSession.is_active == False)
        .order_by(GameSession.start_date.desc(), GameSession.id.desc())
        .offset(max(0, offset))
        .limit(max(1, min(limit, 1000)))
        .all()
    )

    return [
        {
            "id": s.id,
            "title": s.title,
            "status": _effective_status(s),
            "starting_balance_krw": s.starting_balance_krw,
            "starting_balance_usd": s.starting_balance_usd or 0.0,
            "cash_krw": s.cash_krw or 0.0,
            "cash_usd": s.cash_usd or 0.0,
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
    data = get_benchmark_data(index, days)
    if not data:
        return {"error": "Could not fetch benchmark data"}
    return data


@router.get("/summary")
def game_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_current_session(db, current_user)
    if not session:
        return {"active": False}
    return _build_session_summary(db, current_user, session)
