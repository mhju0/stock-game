from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models import GameSession, User
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_current_session,
    get_owned_session,
    get_tradeable_session,
    is_session_expired,
    resolve_session_lifecycle_state,
    sync_legacy_user_balance,
)


def create_user(db_session, username="user", balance_krw=10_000_000, balance_usd=0.0):
    user = User(username=username, hashed_password="hash", balance_krw=balance_krw, balance_usd=balance_usd)
    db_session.add(user)
    db_session.flush()
    return user


def create_session(
    db_session,
    user,
    *,
    title="Session",
    status=None,
    is_active=True,
    start_date=None,
    end_date=None,
    cash_krw=None,
    cash_usd=None,
):
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id,
        title=title,
        status=status,
        starting_balance_krw=10_000_000,
        starting_balance_usd=0.0,
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        duration_days=90,
        start_date=start_date or now,
        end_date=end_date or (now + timedelta(days=90)),
        is_active=is_active,
    )
    db_session.add(session)
    db_session.flush()
    return session


class TestOwnedSession:
    def test_owned_session_success(self, db_session):
        user = create_user(db_session)
        session = create_session(db_session, user)

        result = get_owned_session(db_session, user, session.id)

        assert result.id == session.id

    def test_missing_session_returns_404(self, db_session):
        user = create_user(db_session)

        with pytest.raises(HTTPException) as exc:
            get_owned_session(db_session, user, 999)

        assert exc.value.status_code == 404

    def test_cross_user_session_returns_404(self, db_session):
        owner = create_user(db_session, username="owner")
        other = create_user(db_session, username="other")
        session = create_session(db_session, owner)

        with pytest.raises(HTTPException) as exc:
            get_owned_session(db_session, other, session.id)

        assert exc.value.status_code == 404


class TestCurrentSession:
    def test_current_session_accepts_case_normalized_active_status(self, db_session):
        user = create_user(db_session)
        session = create_session(
            db_session,
            user,
            status="ACTIVE",
            is_active=False,
        )

        result = get_current_session(db_session, user)

        assert result.id == session.id

    def test_current_session_skips_newer_expired_session(self, db_session):
        user = create_user(db_session)
        now = datetime.now(timezone.utc)
        active = create_session(
            db_session,
            user,
            title="active",
            status="active",
            start_date=now - timedelta(days=2),
            end_date=now + timedelta(days=1),
        )
        create_session(
            db_session,
            user,
            title="expired",
            status="active",
            start_date=now - timedelta(days=1),
            end_date=now - timedelta(seconds=1),
        )

        result = get_current_session(
            db_session,
            user,
        )

        assert result.id == active.id

    def test_current_session_chooses_newest_active_session(self, db_session):
        user = create_user(db_session)
        old = create_session(
            db_session,
            user,
            title="old",
            is_active=True,
            start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        newest = create_session(
            db_session,
            user,
            title="newest",
            status="active",
            is_active=False,
            start_date=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        create_session(
            db_session,
            user,
            title="archived",
            status="archived",
            is_active=False,
            start_date=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )

        result = get_current_session(db_session, user)

        assert result.id == newest.id
        assert result.id != old.id


class TestTradeableSession:
    @pytest.mark.parametrize(
        ("status", "is_active", "end_date", "expected"),
        [
            ("archived", True, datetime.now(timezone.utc) - timedelta(days=1), "archived"),
            ("completed", True, datetime.now(timezone.utc) - timedelta(days=1), "completed"),
            ("active", True, datetime.now(timezone.utc) - timedelta(days=1), "expired"),
            ("active", False, datetime.now(timezone.utc) + timedelta(days=1), "active"),
            (None, True, datetime.now(timezone.utc) + timedelta(days=1), "active"),
            (None, False, datetime.now(timezone.utc) + timedelta(days=1), "completed"),
        ],
    )
    def test_resolves_canonical_lifecycle_state(
        self,
        db_session,
        status,
        is_active,
        end_date,
        expected,
    ):
        user = create_user(db_session)
        session = create_session(
            db_session,
            user,
            status=status,
            is_active=is_active,
            end_date=end_date,
        )

        state = resolve_session_lifecycle_state(session, now=datetime.now(timezone.utc))

        assert state == expected

    def test_expired_session_blocks_trade(self, db_session):
        user = create_user(db_session)
        session = create_session(
            db_session,
            user,
            status="active",
            end_date=datetime.now(timezone.utc) - timedelta(seconds=1),
        )

        with pytest.raises(HTTPException) as exc:
            get_tradeable_session(db_session, user, session.id)

        assert exc.value.status_code == 400

    @pytest.mark.parametrize("status", ["completed", "expired", "archived"])
    def test_non_tradeable_status_blocks_trade(self, db_session, status):
        user = create_user(db_session)
        session = create_session(db_session, user, status=status, is_active=False)

        with pytest.raises(HTTPException) as exc:
            get_tradeable_session(db_session, user, session.id)

        assert exc.value.status_code == 400

    def test_is_session_expired_handles_naive_datetimes_as_utc(self, db_session):
        user = create_user(db_session)
        session = create_session(
            db_session,
            user,
            end_date=datetime(2026, 1, 2),
        )

        assert is_session_expired(session, now=datetime(2026, 1, 3, tzinfo=timezone.utc))


class TestCashBridge:
    def test_cash_initialization_copies_legacy_user_balance_when_null(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000, balance_usd=25.5)
        session = create_session(db_session, user, cash_krw=None, cash_usd=None)

        ensure_session_cash_initialized(session, user)

        assert session.cash_krw == 3_000_000
        assert session.cash_usd == 25.5

    def test_cash_initialization_does_not_overwrite_existing_session_cash(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000, balance_usd=25.5)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=10.0)

        ensure_session_cash_initialized(session, user)

        assert session.cash_krw == 1_000_000
        assert session.cash_usd == 10.0

    def test_legacy_sync_copies_session_cash_to_user_balance(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000, balance_usd=25.5)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=10.0)

        sync_legacy_user_balance(user, session)

        assert user.balance_krw == 1_000_000
        assert user.balance_usd == 10.0
