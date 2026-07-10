"""
The hourly snapshot batch must be resilient: one user's failure must not abort
snapshots for the remaining users, and every active session per user should be
snapshotted (not just the newest one).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import GameSession, Holding, PortfolioSnapshot, User
from app.services import snapshot_service
from app.services.snapshot_service import run_snapshot_batch


def _user(db_session, username):
    user = User(username=username, hashed_password="hash",
                balance_krw=1_000_000.0, balance_usd=0.0)
    db_session.add(user)
    db_session.flush()
    return user


def _active_session(db_session, user, title="S", cash_krw=1_000_000.0):
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id, title=title, status="active",
        starting_balance_krw=1_000_000.0, starting_balance_usd=0.0,
        cash_krw=cash_krw, cash_usd=0.0, duration_days=90,
        start_date=now - timedelta(days=1), end_date=now + timedelta(days=90),
        is_active=True,
    )
    db_session.add(session)
    db_session.flush()
    return session


def _price_patch(rate=1300.0):
    return patch.multiple(
        "app.services.snapshot_service",
        get_exchange_rate=lambda: rate,
        get_prices_for_tickers=lambda tickers: {t: 100.0 for t in tickers},
    )


class TestSnapshotBatchResilience:
    def test_batch_continues_past_a_failing_user(self, db_session):
        bad = _user(db_session, "bad-user")
        good = _user(db_session, "good-user")
        _active_session(db_session, bad)
        _active_session(db_session, good)
        # Commit fixtures so the batch's per-user db.rollback() (which in
        # production only discards the failing user's partial work) does not
        # wipe the test's own setup rows.
        db_session.commit()

        real = snapshot_service.take_session_snapshot

        def flaky(db, user_id, game_session_id):
            if user_id == bad.id:
                raise RuntimeError("simulated snapshot failure")
            return real(db, user_id=user_id, game_session_id=game_session_id)

        with _price_patch(), patch.object(snapshot_service, "take_session_snapshot", side_effect=flaky):
            ok = run_snapshot_batch(db_session)

        # The good user was still snapshotted; the failing user was skipped, not fatal.
        assert ok == 1
        good_snaps = db_session.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == good.id).count()
        bad_snaps = db_session.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == bad.id).count()
        assert good_snaps == 1
        assert bad_snaps == 0

    def test_batch_snapshots_every_active_session(self, db_session):
        user = _user(db_session, "multi-user")
        s1 = _active_session(db_session, user, title="Game 1")
        s2 = _active_session(db_session, user, title="Game 2")

        with _price_patch():
            run_snapshot_batch(db_session)

        session_ids = {
            row.game_session_id
            for row in db_session.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.user_id == user.id).all()
        }
        assert s1.id in session_ids
        assert s2.id in session_ids
