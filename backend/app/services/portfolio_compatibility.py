from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_current_session,
)


def ensure_session_cash_for_read(
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


def read_current_session(db: Session, user: User) -> GameSession | None:
    session = get_current_session(db, user)
    if session:
        ensure_session_cash_for_read(db, session, user)
    return session


def session_starting_value_krw(session: GameSession, rate: float) -> float:
    return (session.starting_balance_krw or 0.0) + (
        (session.starting_balance_usd or 0.0) * rate
    )


def legacy_starting_value_krw(session: GameSession | None) -> float:
    return session.starting_balance_krw if session else 10_000_000


def _has_scoped_rows(
    db: Session,
    model,
    user_id: int,
    session_id: int,
) -> bool:
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


def resolve_compatibility_session_id(
    db: Session,
    user_id: int,
    session: GameSession | None,
    models: Iterable,
) -> int | None:
    if not session:
        return None

    models = tuple(models)
    has_scoped = any(
        _has_scoped_rows(db, model, user_id, session.id) for model in models
    )
    has_unscoped = any(_has_unscoped_rows(db, model, user_id) for model in models)
    return None if not has_scoped and has_unscoped else session.id


def resolve_legacy_preferred_session_id(
    db: Session,
    user_id: int,
    session: GameSession | None,
    models: Iterable,
) -> int | None:
    """Preserve callers where any legacy row keeps the legacy storage path."""
    if not session:
        return None
    has_unscoped = any(_has_unscoped_rows(db, model, user_id) for model in models)
    return None if has_unscoped else session.id


def holdings_query(db: Session, user_id: int, game_session_id: int | None):
    query = db.query(Holding).filter(Holding.user_id == user_id)
    if game_session_id is None:
        return query.filter(Holding.game_session_id.is_(None))
    return query.filter(Holding.game_session_id == game_session_id)


def transactions_query(db: Session, user_id: int, game_session_id: int | None):
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if game_session_id is None:
        return query.filter(Transaction.game_session_id.is_(None))
    return query.filter(Transaction.game_session_id == game_session_id)


def snapshots_query(db: Session, user_id: int, game_session_id: int | None):
    query = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id)
    if game_session_id is None:
        return query.filter(PortfolioSnapshot.game_session_id.is_(None))
    return query.filter(PortfolioSnapshot.game_session_id == game_session_id)
