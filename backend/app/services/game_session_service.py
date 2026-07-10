from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import GameSession, User


NON_TRADEABLE_STATUSES = {"completed", "expired", "archived"}


def _as_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def is_session_expired(session: GameSession, now: datetime | None = None) -> bool:
    """Return whether the session has passed its configured end date."""
    end_date = _as_aware_utc(session.end_date)
    if end_date is None:
        return False
    current_time = _as_aware_utc(now) or datetime.now(timezone.utc)
    return end_date <= current_time


def get_owned_session(
    db: Session,
    current_user: User,
    session_id: int,
    *,
    for_update: bool = False,
) -> GameSession:
    """Load a session owned by current_user, hiding missing/cross-user sessions as 404.

    Pass for_update=True on trade paths to lock the row (SELECT ... FOR UPDATE)
    so the session cash check-and-debit is atomic. Read paths leave it False so
    they never take a lock.
    """
    query = db.query(GameSession).filter(
        GameSession.id == session_id, GameSession.user_id == current_user.id
    )
    if for_update:
        query = query.with_for_update()
    session = query.first()
    if not session:
        raise HTTPException(status_code=404, detail="Game session not found")
    return session


def get_current_session(db: Session, current_user: User) -> GameSession | None:
    """Transitional helper for existing single-active-session behavior.

    Old rows only have is_active. New rows may also use status="active".
    The newest matching session wins so existing routes can safely preserve
    their current active-game behavior until they become explicitly session
    scoped.
    """
    return (
        db.query(GameSession)
        .filter(
            GameSession.user_id == current_user.id,
            or_(GameSession.is_active == True, GameSession.status == "active"),
        )
        .order_by(GameSession.start_date.desc(), GameSession.id.desc())
        .first()
    )


def get_tradeable_session(
    db: Session,
    current_user: User,
    session_id: int,
    *,
    for_update: bool = False,
) -> GameSession:
    """Load an owned session and reject sessions that should not accept trades."""
    session = get_owned_session(db, current_user, session_id, for_update=for_update)
    status = (session.status or "").lower()
    if status in NON_TRADEABLE_STATUSES:
        raise HTTPException(status_code=400, detail="Game session is not tradeable")
    if is_session_expired(session):
        raise HTTPException(status_code=400, detail="Game session has expired")
    return session


def ensure_session_cash_initialized(session: GameSession, user: User) -> GameSession:
    """Initialize nullable session cash from legacy User.balance_* fields.

    This is a migration bridge. It only fills null GameSession.cash_* values
    and never overwrites existing per-session cash.
    """
    if session.cash_krw is None:
        session.cash_krw = user.balance_krw or 0.0
    if session.cash_usd is None:
        session.cash_usd = user.balance_usd or 0.0
    return session


def sync_legacy_user_balance(user: User, session: GameSession) -> User:
    """Mirror selected session cash back to User.balance_* during migration.

    Remove this helper once all runtime paths read and write GameSession.cash_*
    directly and the legacy user-level cash fields are no longer needed.
    """
    if session.cash_krw is not None:
        user.balance_krw = session.cash_krw
    if session.cash_usd is not None:
        user.balance_usd = session.cash_usd
    return user
