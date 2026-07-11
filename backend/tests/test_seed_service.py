"""Demo seed/reset: baseline shape, idempotent reset, strict user scoping."""

from datetime import datetime, timezone

from app.models import User, Holding, Transaction, GameSession, PortfolioSnapshot, Watchlist
from app.services.seed_service import (
    seed_demo,
    DEMO_USERNAME,
    STARTING_BALANCE_KRW,
    BACKDATE_DAYS,
)


def _demo(db):
    return db.query(User).filter(User.username == DEMO_USERNAME).first()


def test_seed_creates_session_scoped_baseline(db_session):
    assert seed_demo(db_session) is True
    user = _demo(db_session)
    assert user is not None

    sessions = db_session.query(GameSession).filter(GameSession.user_id == user.id).all()
    assert len(sessions) == 1
    session = sessions[0]
    assert session.status == "active"
    assert session.starting_balance_krw == STARTING_BALANCE_KRW

    holdings = db_session.query(Holding).filter(Holding.user_id == user.id).all()
    # Every holding is scoped to the demo session (no legacy NULL-session rows).
    assert holdings and all(h.game_session_id == session.id for h in holdings)
    # Sector diversity: at least 5 distinct sectors across KR and US markets.
    assert len({h.sector for h in holdings}) >= 5
    assert {h.market for h in holdings} == {"KRX", "US"}

    txs = db_session.query(Transaction).filter(Transaction.user_id == user.id).all()
    assert all(t.game_session_id == session.id for t in txs)
    kinds = {t.transaction_type for t in txs}
    assert {"BUY", "SELL", "EXCHANGE"} <= kinds
    # The sell realized a profit.
    sell = next(t for t in txs if t.transaction_type == "SELL")
    assert sell.realized_pnl > 0

    # Cash never went negative while replaying, and ends positive in both currencies.
    assert session.cash_krw > 0
    assert session.cash_usd > 0

    # Snapshot series covers the backdated window so charts render immediately.
    snaps = (
        db_session.query(PortfolioSnapshot)
        .filter(PortfolioSnapshot.user_id == user.id)
        .order_by(PortfolioSnapshot.created_at)
        .all()
    )
    assert len(snaps) == BACKDATE_DAYS + 1
    assert all(s.game_session_id == session.id for s in snaps)
    assert snaps[0].total_value_krw > 0

    assert db_session.query(Watchlist).filter(Watchlist.user_id == user.id).count() > 0


def test_seed_resets_drift_without_duplicating(db_session):
    seed_demo(db_session)
    user = _demo(db_session)
    session = db_session.query(GameSession).filter(GameSession.user_id == user.id).one()

    # A visitor "dirties" the demo: extra holding + emptied cash.
    db_session.add(Holding(
        user_id=user.id, game_session_id=session.id, ticker="ZZZZ",
        name="Drift Corp", market="US", quantity=99, avg_price=1.0, currency="USD",
    ))
    session.cash_krw = 0.0
    db_session.commit()
    # Drop our stale references before the service bulk-deletes those rows
    # (SQLite reuses PKs, which would otherwise collide in the identity map).
    db_session.expunge_all()

    seed_demo(db_session)

    users = db_session.query(User).filter(User.username == DEMO_USERNAME).all()
    assert len(users) == 1  # same account, never duplicated
    sessions = db_session.query(GameSession).filter(GameSession.user_id == users[0].id).all()
    assert len(sessions) == 1
    tickers = {h.ticker for h in db_session.query(Holding).filter(Holding.user_id == users[0].id)}
    assert "ZZZZ" not in tickers  # drift wiped
    assert sessions[0].cash_krw > 0  # baseline restored


def test_seed_never_touches_other_users(db_session):
    other = User(
        username="realuser", hashed_password="x",
        balance_krw=5_000.0, balance_usd=1.0,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(other)
    db_session.flush()
    keep = Holding(
        user_id=other.id, game_session_id=None, ticker="KEEP",
        name="Keep Corp", market="US", quantity=1, avg_price=10.0, currency="USD",
    )
    db_session.add(keep)
    db_session.commit()

    seed_demo(db_session)   # creates demo
    seed_demo(db_session)   # resets demo

    survivors = db_session.query(Holding).filter(Holding.user_id == other.id).all()
    assert [h.ticker for h in survivors] == ["KEEP"]
    refreshed = db_session.query(User).filter(User.username == "realuser").one()
    assert refreshed.balance_krw == 5_000.0
