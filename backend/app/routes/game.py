from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User
from app.schemas import GameSessionCreateRequest, GameSessionUpdateRequest, NewGameRequest
from app.services.benchmark_service import get_benchmark_data
from app.services.exchange_service import get_exchange_rate
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_active_sessions,
    get_current_session,
    get_owned_session,
    lock_user_for_mutation,
    resolve_session_lifecycle_state,
)
from app.services.public_rate_limit import enforce_market_data_rate_limit, enforce_session_create_rate_limit
from app.services.portfolio_compatibility import (
    ensure_session_cash_for_read,
    session_starting_value_krw,
)
from app.services.valuation_service import (
    compute_session_total_value_krw,
    get_infos_for_tickers,
    get_prices_for_tickers,
    resolved_sector,
    valuation_available,
    valuation_fields,
)

from app.services.realized_service import realized_performance

router = APIRouter(prefix="/game", tags=["game"])

# Game creation is non-destructive and unlimited, so an account could otherwise
# grow the table without bound. Far above any real play pattern.
MAX_ACTIVE_SESSIONS = 20


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    aware = _as_aware_utc(value)
    return aware.isoformat() if aware else None


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
        .order_by(PortfolioSnapshot.created_at.asc(), PortfolioSnapshot.id.asc())
        .all()
    )


def _saved_session_values(session, first_snapshot, last_snapshot, has_activity, rate):
    starting_value = (first_snapshot.total_value_krw if first_snapshot
                      else session_starting_value_krw(session, rate))
    starting_source = "first_snapshot" if first_snapshot else "session_starting_balance"
    if last_snapshot:
        return starting_value, last_snapshot.total_value_krw, starting_source, "last_snapshot"
    if session.final_value_krw is not None:
        return starting_value, session.final_value_krw, starting_source, "session_final_value"
    if not has_activity:
        ending_value = (session.cash_krw or 0.0) + ((session.cash_usd or 0.0) * rate)
        return starting_value, ending_value, starting_source, "cash_only_session_balance"
    return starting_value, None, starting_source, None


def _session_current_value_krw(
    session: GameSession,
    holdings: list[Holding],
    rate: float,
) -> float | None:
    prices = get_prices_for_tickers([h.ticker for h in holdings])
    return (compute_session_total_value_krw(session, holdings, rate, prices)
            if valuation_available(holdings, rate, prices) else None)


def _create_session(
    db: Session,
    user: User,
    *,
    title: str | None,
    duration_days: int,
    starting_balance_krw: float,
    starting_balance_usd: float = 0.0,
) -> GameSession:
    user = lock_user_for_mutation(db, user.id)
    # Guarded here rather than per route so both creation entry points are covered.
    if len(get_active_sessions(db, user)) >= MAX_ACTIVE_SESSIONS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You already have {MAX_ACTIVE_SESSIONS} active games. "
                "Finish or delete one before starting another."
            ),
        )

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

    # Legacy mirror retained for compatibility routes that still read User.balance_*.
    user.balance_krw = starting_balance_krw
    user.balance_usd = starting_balance_usd

    db.commit()
    db.refresh(session)
    db.refresh(user)
    return session


def _serialize_sessions(db: Session, user: User, sessions: list[GameSession]) -> list[dict]:
    if not sessions:
        return []

    user_id = user.id
    session_ids = [session.id for session in sessions]
    # Preserve the nullable-cash migration bridge without committing once per row.
    needs_commit = any(s.cash_krw is None or s.cash_usd is None for s in sessions)
    if needs_commit:
        user = lock_user_for_mutation(db, user_id)
        locked_sessions = (db.query(GameSession).filter(
            GameSession.user_id == user_id, GameSession.id.in_(session_ids),
        ).order_by(GameSession.id).populate_existing().with_for_update().all())
        for session in locked_sessions:
            ensure_session_cash_initialized(session, user)
        db.commit()
        # Commit expires ORM instances; reload together instead of lazily per row.
        by_id = {s.id: s for s in db.query(GameSession).filter(
            GameSession.user_id == user_id, GameSession.id.in_(session_ids),
        ).all()}
        sessions = [by_id[session_id] for session_id in session_ids]

    holdings_by_session = defaultdict(list)
    holdings = db.query(Holding).filter(
        Holding.user_id == user_id, Holding.game_session_id.in_(session_ids),
    ).all()
    for holding in holdings:
        holdings_by_session[holding.game_session_id].append(holding)
    snapshot_positions = db.query(
        PortfolioSnapshot.id,
        func.row_number().over(
            partition_by=PortfolioSnapshot.game_session_id,
            order_by=(PortfolioSnapshot.created_at.asc(), PortfolioSnapshot.id.asc()),
        ).label("first_position"),
        func.row_number().over(
            partition_by=PortfolioSnapshot.game_session_id,
            order_by=(PortfolioSnapshot.created_at.desc(), PortfolioSnapshot.id.desc()),
        ).label("last_position"),
    ).filter(
        PortfolioSnapshot.user_id == user_id,
        PortfolioSnapshot.game_session_id.in_(session_ids),
    ).subquery()
    boundary_snapshots = db.query(
        PortfolioSnapshot, snapshot_positions.c.first_position, snapshot_positions.c.last_position,
    ).join(snapshot_positions, PortfolioSnapshot.id == snapshot_positions.c.id).filter(
        or_(snapshot_positions.c.first_position == 1, snapshot_positions.c.last_position == 1),
    ).all()
    first_snapshots, last_snapshots = {}, {}
    for snapshot, first_position, last_position in boundary_snapshots:
        if first_position == 1:
            first_snapshots[snapshot.game_session_id] = snapshot
        if last_position == 1:
            last_snapshots[snapshot.game_session_id] = snapshot
    cash_only_candidates = [s.id for s in sessions
                            if resolve_session_lifecycle_state(s) != "active"
                            and s.id not in last_snapshots and s.final_value_krw is None
                            and not holdings_by_session[s.id]]
    transaction_sessions = set()
    if cash_only_candidates:
        transaction_sessions = {row[0] for row in db.query(Transaction.game_session_id).filter(
            Transaction.user_id == user_id, Transaction.game_session_id.in_(cash_only_candidates),
        ).distinct().all()}
    rate = get_exchange_rate()
    prices = get_prices_for_tickers([
        holding.ticker for session in sessions
        if resolve_session_lifecycle_state(session) == "active"
        for holding in holdings_by_session[session.id]
    ])
    serialized = []
    for session in sessions:
        available = valuation_available(holdings_by_session[session.id], rate, prices)
        current_value = (compute_session_total_value_krw(
            session, holdings_by_session[session.id], rate, prices,
        ) if available else None)
        starting_value = session_starting_value_krw(session, rate)
        last_snapshot = last_snapshots.get(session.id)
        latest_snapshot_at = last_snapshot.created_at if last_snapshot else None
        start_date = _as_aware_utc(session.start_date)
        end_date = _as_aware_utc(session.end_date)
        last_updated = (
            latest_snapshot_at
            if latest_snapshot_at
            else session.updated_at or session.created_at or session.start_date
        )
        lifecycle_state = resolve_session_lifecycle_state(session)
        value_source = "live_market_prices" if available else None
        value_as_of = None
        uses_live_fx = available
        if lifecycle_state != "active":
            starting_value, current_value, _, value_source = _saved_session_values(
                session, first_snapshots.get(session.id), last_snapshot,
                bool(holdings_by_session[session.id]) or session.id in transaction_sessions, rate,
            )
            available = current_value is not None
            value_as_of = _iso(last_snapshot.created_at) if last_snapshot else None
            uses_live_fx = value_source == "cash_only_session_balance" and bool(session.cash_usd)

        serialized.append({
            "id": session.id,
            "title": session.title,
            "status": lifecycle_state,
            "is_active": bool(session.is_active),
            "is_expired": lifecycle_state == "expired",
            "starting_balance_krw": session.starting_balance_krw,
            "starting_balance_usd": session.starting_balance_usd or 0.0,
            "cash_krw": session.cash_krw or 0.0,
            "cash_usd": session.cash_usd or 0.0,
            **valuation_fields(available),
            "valuation_unavailable_reason": (None if available else "missing_market_prices" if lifecycle_state == "active" else "missing_saved_valuation"),
            "valuation_source": value_source,
            "valuation_as_of": value_as_of,
            "valuation_uses_live_fx": uses_live_fx,
            "current_value_krw": round(current_value, 2) if available else None,
            "current_return_pct": (
                round(((current_value - starting_value) / starting_value) * 100, 2)
                if available and starting_value else (0 if available and lifecycle_state == "active" else None)
            ),
            "duration_days": session.duration_days,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "last_updated_at": _iso(last_updated),
            "created_at": _iso(session.created_at),
            "updated_at": _iso(session.updated_at),
            "completed_at": _iso(session.completed_at),
        })
    return serialized


def _build_session_status(db: Session, user: User, session: GameSession) -> dict:
    ensure_session_cash_for_read(db, session, user)
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
    starting_value = session_starting_value_krw(session, rate)
    lifecycle_state = resolve_session_lifecycle_state(session, now)

    return {
        "active": lifecycle_state == "active",
        "session_id": session.id,
        "title": session.title,
        "status": lifecycle_state,
        "starting_balance_krw": session.starting_balance_krw,
        "starting_balance_usd": session.starting_balance_usd or 0.0,
        "cash_krw": session.cash_krw or 0.0,
        "cash_usd": session.cash_usd or 0.0,
        **valuation_fields(current_value is not None),
        "current_value_krw": round(current_value, 2) if current_value is not None else None,
        "current_return_pct": (
            round(((current_value - starting_value) / starting_value) * 100, 2)
            if current_value is not None and starting_value else (0 if current_value is not None else None)
        ),
        "duration_days": session.duration_days,
        "days_elapsed": round(days_elapsed, 1),
        "days_remaining": round(days_remaining, 1),
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "is_expired": lifecycle_state == "expired",
    }


def _build_session_summary(db: Session, user: User, session: GameSession) -> dict:
    ensure_session_cash_for_read(db, session, user)
    user_id = user.id
    rate = get_exchange_rate()
    holdings = _session_holdings(db, user_id, session.id)
    tickers = [h.ticker for h in holdings]
    prices = get_prices_for_tickers(tickers)
    infos = get_infos_for_tickers(tickers)
    available = valuation_available(holdings, rate, prices)
    current_value = compute_session_total_value_krw(session, holdings, rate, prices) if available else None
    starting_value = session_starting_value_krw(session, rate)
    total_return = current_value - starting_value if available else None
    total_return_pct = ((total_return / starting_value) * 100 if starting_value else 0) if available else None

    all_transactions = _session_transactions(db, user_id, session.id)
    buys = [t for t in all_transactions if t.transaction_type == "BUY"]
    sells = [t for t in all_transactions if t.transaction_type == "SELL"]
    exchanges = [t for t in all_transactions if t.transaction_type == "EXCHANGE"]

    realized = realized_performance(sells)

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
    lifecycle_state = resolve_session_lifecycle_state(session, now)

    return {
        "active": lifecycle_state == "active",
        "session_id": session.id,
        "title": session.title,
        "status": lifecycle_state,
        "starting_balance": session.starting_balance_krw,
        "starting_balance_krw": session.starting_balance_krw,
        "starting_balance_usd": session.starting_balance_usd or 0.0,
        **valuation_fields(current_value is not None),
        "current_value": round(current_value, 2) if current_value is not None else None,
        "current_value_krw": round(current_value, 2) if current_value is not None else None,
        "total_return": round(total_return, 2) if total_return is not None else None,
        "total_return_pct": round(total_return_pct, 2) if total_return_pct is not None else None,
        "duration_days": session.duration_days,
        "days_elapsed": round(days_elapsed, 1),
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "is_expired": lifecycle_state == "expired",
        "total_trades": len(buys) + len(sells),
        "total_buys": len(buys),
        "total_sells": len(sells),
        "total_exchanges": len(exchanges),
        **{key: value for key, value in realized.items() if key not in {"total_realized_pnl", "total_trades"}},
        "realized_pnl": realized["total_realized_pnl"],
        "most_traded": most_traded,
        "current_holdings_count": len(holdings),
        "sectors": sectors if available else None,
        "peak_value": round(peak_value, 2),
        "trough_value": round(trough_value, 2),
        "cash_krw": session.cash_krw or 0.0,
        "cash_usd": session.cash_usd or 0.0,
    }


def _build_session_result(db: Session, user: User, session: GameSession) -> dict:
    ensure_session_cash_for_read(db, session, user)
    user_id = user.id
    now = datetime.now(timezone.utc)
    effective_status = resolve_session_lifecycle_state(session, now)
    start_date = _as_aware_utc(session.start_date)
    end_date = _as_aware_utc(session.end_date)
    snapshots = _session_snapshots(db, user_id, session.id)
    holdings = _session_holdings(db, user_id, session.id)
    transactions = _session_transactions(db, user_id, session.id)

    first_snapshot = snapshots[0] if snapshots else None
    last_snapshot = snapshots[-1] if snapshots else None
    fallback_rate = get_exchange_rate()
    start_rate = first_snapshot.exchange_rate if first_snapshot else fallback_rate

    starting_value, ending_value, starting_source, ending_source = _saved_session_values(
        session, first_snapshot, last_snapshot, bool(holdings or transactions), start_rate,
    )

    total_return = None
    total_return_pct = None
    if ending_value is not None:
        total_return = ending_value - starting_value
        if starting_value:
            total_return_pct = (total_return / starting_value) * 100

    buys = [t for t in transactions if t.transaction_type == "BUY"]
    sells = [t for t in transactions if t.transaction_type == "SELL"]
    exchanges = [t for t in transactions if t.transaction_type == "EXCHANGE"]

    realized_by_currency: dict[str, float] = {}
    realized_available = True
    for tx in sells:
        if tx.realized_pnl is None:
            realized_available = False
            continue
        realized_by_currency[tx.currency] = realized_by_currency.get(tx.currency, 0.0) + tx.realized_pnl

    realized_pnl = {
        "available": realized_available,
        "by_currency": {
            currency: round(amount, 2)
            for currency, amount in sorted(realized_by_currency.items())
        },
    }
    if not realized_available:
        realized_pnl["reason"] = "missing_sell_realized_pnl"

    best_stock = None
    worst_stock = None
    stock_result_reason = None
    sell_currencies = {tx.currency for tx in sells}
    if sells and realized_available and len(sell_currencies) == 1:
        realized_by_stock: dict[str, dict] = {}
        for tx in sells:
            if tx.realized_pnl is None:
                continue
            item = realized_by_stock.setdefault(
                tx.ticker,
                {
                    "ticker": tx.ticker,
                    "name": tx.name,
                    "market": tx.market,
                    "currency": tx.currency,
                    "realized_pnl": 0.0,
                    "sell_trades": 0,
                },
            )
            item["realized_pnl"] += tx.realized_pnl
            item["sell_trades"] += 1

        if realized_by_stock:
            best_stock = max(realized_by_stock.values(), key=lambda item: item["realized_pnl"])
            worst_stock = min(realized_by_stock.values(), key=lambda item: item["realized_pnl"])
            best_stock["realized_pnl"] = round(best_stock["realized_pnl"], 2)
            worst_stock["realized_pnl"] = round(worst_stock["realized_pnl"], 2)
    elif sells:
        stock_result_reason = "missing_sell_realized_pnl" if not realized_available else "mixed_realized_pnl_currencies"

    peak_value = max((snapshot.total_value_krw for snapshot in snapshots), default=None)
    trough_value = min((snapshot.total_value_krw for snapshot in snapshots), default=None)

    final_cash_krw = last_snapshot.cash_krw if last_snapshot else (session.cash_krw or 0.0)
    final_cash_usd = last_snapshot.cash_usd if last_snapshot else (session.cash_usd or 0.0)

    return {
        "session_id": session.id,
        "title": session.title,
        "status": effective_status,
        "is_completed": effective_status in {"completed", "expired", "archived"},
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "completed_at": _iso(session.completed_at),
        "duration_days": session.duration_days,
        "starting_value_krw": round(starting_value, 2),
        "starting_value_source": starting_source,
        "ending_value_krw": round(ending_value, 2) if ending_value is not None else None,
        "ending_value_source": ending_source,
        "ending_value_as_of": _iso(last_snapshot.created_at) if last_snapshot else None,
        "ending_value_uses_live_fx": ending_source == "cash_only_session_balance" and bool(session.cash_usd),
        "total_return_krw": round(total_return, 2) if total_return is not None else None,
        "total_return_pct": round(total_return_pct, 2) if total_return_pct is not None else None,
        "return_available": ending_value is not None and bool(starting_value),
        "final_cash_krw": round(final_cash_krw, 2),
        "final_cash_usd": round(final_cash_usd, 2),
        "final_holdings": [
            {
                "ticker": holding.ticker,
                "name": holding.name,
                "market": holding.market,
                "sector": holding.sector,
                "industry": holding.industry,
                "quantity": holding.quantity,
                "avg_price": holding.avg_price,
                "currency": holding.currency,
                "book_cost": round(holding.avg_price * holding.quantity, 2),
            }
            for holding in holdings
        ],
        "trade_count": len(buys) + len(sells),
        "buy_count": len(buys),
        "sell_count": len(sells),
        "exchange_count": len(exchanges),
        "transaction_count": len(transactions),
        "realized_pnl": realized_pnl,
        "best_stock": best_stock,
        "worst_stock": worst_stock,
        "stock_result_unavailable_reason": stock_result_reason,
        "snapshot_count": len(snapshots),
        "peak_value_krw": round(peak_value, 2) if peak_value is not None else None,
        "trough_value_krw": round(trough_value, 2) if trough_value is not None else None,
        "result_data_available": ending_value is not None,
    }


@router.get("/sessions")
def game_sessions(
    include_all: bool = False,
    include_completed: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Backward compatibility: callers that omit both flags still receive only
    # playable sessions. The current frontend opts into full session history.
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
            if resolve_session_lifecycle_state(session) == "active"
        ]
    return {"sessions": _serialize_sessions(db, current_user, sessions)}


@router.post("/sessions", dependencies=[Depends(enforce_session_create_rate_limit)])
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
    return {"status": "success", "session": _serialize_sessions(db, current_user, [session])[0]}


@router.get("/sessions/{session_id}")
def get_game_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    return {"session": _serialize_sessions(db, current_user, [session])[0]}


@router.patch("/sessions/{session_id}")
def update_game_session(
    session_id: int,
    request: GameSessionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user = lock_user_for_mutation(db, current_user.id)
    session = get_owned_session(db, current_user, session_id, for_update=True)
    updates = request.model_dump(exclude_unset=True)

    if "title" in updates:
        title = (request.title or "").strip()
        session.title = title[:80] or "Trading Simulation"

    if "status" in updates:
        status = (request.status or "").strip().lower()
        if status not in {"active", "completed", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid game session status")
        if status == "active" and resolve_session_lifecycle_state(session) in {
            "completed",
            "archived",
        }:
            raise HTTPException(
                status_code=400,
                detail="Ended game sessions cannot be reactivated",
            )

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
    return {"status": "success", "session": _serialize_sessions(db, current_user, [session])[0]}


@router.delete("/sessions/{session_id}")
def delete_game_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user = lock_user_for_mutation(db, current_user.id)
    session = get_owned_session(db, current_user, session_id, for_update=True)
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


@router.get("/sessions/{session_id}/result")
def get_game_session_result(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(db, current_user, session_id)
    return _build_session_result(db, current_user, session)


@router.post("/new", dependencies=[Depends(enforce_session_create_rate_limit)])
def start_new_game(
    request: NewGameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Compatibility alias for legacy clients. It creates a separate session and
    # no longer resets existing game data.
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
            "status": resolve_session_lifecycle_state(session),
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
    sessions = [
        session
        for session in (
            db.query(GameSession)
            .filter(GameSession.user_id == current_user.id)
            .order_by(GameSession.start_date.desc(), GameSession.id.desc())
            .all()
        )
        if resolve_session_lifecycle_state(session) != "active"
    ]
    start = max(0, offset)
    sessions = sessions[start : start + max(1, min(limit, 1000))]

    return [
        {
            "id": s.id,
            "title": s.title,
            "status": resolve_session_lifecycle_state(s),
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


@router.get(
    "/benchmark/{index}",
    dependencies=[Depends(enforce_market_data_rate_limit)],
)
def benchmark(index: str, days: int = Query(default=90, ge=2, le=3650)):
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
