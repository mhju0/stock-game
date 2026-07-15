"""Demo seed/reset: baseline shape, idempotent reset, strict user scoping."""

from datetime import datetime, timedelta, timezone

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
    assert len(sessions) == 5
    assert {session.title for session in sessions} == {
        "Demo Portfolio",
        "Dividend & Quality",
        "Spring Growth Sprint",
        "Value Rebound Test",
        "AI & Chips Rotation",
    }
    session = next(session for session in sessions if session.title == "Demo Portfolio")
    assert session.status == "active"
    assert session.starting_balance_krw == STARTING_BALANCE_KRW

    holdings = db_session.query(Holding).filter(Holding.user_id == user.id).all()
    # Every holding is session-scoped (no legacy NULL-session rows).
    session_ids = {item.id for item in sessions}
    assert holdings and all(h.game_session_id in session_ids for h in holdings)
    primary_holdings = [holding for holding in holdings if holding.game_session_id == session.id]
    # Sector diversity: at least 5 distinct sectors across KR and US markets.
    assert len({h.sector for h in primary_holdings}) >= 5
    assert {h.market for h in primary_holdings} == {"KRX", "US"}

    txs = (
        db_session.query(Transaction)
        .filter(Transaction.user_id == user.id, Transaction.game_session_id == session.id)
        .all()
    )
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
        .filter(
            PortfolioSnapshot.user_id == user.id,
            PortfolioSnapshot.game_session_id == session.id,
        )
        .order_by(PortfolioSnapshot.created_at)
        .all()
    )
    assert len(snaps) == BACKDATE_DAYS + 1
    assert all(s.game_session_id == session.id for s in snaps)
    assert snaps[0].total_value_krw > 0

    assert db_session.query(Watchlist).filter(Watchlist.user_id == user.id).count() > 0


def test_seed_creates_natural_2026_game_history(db_session):
    seed_demo(db_session)
    user = _demo(db_session)
    sessions = (
        db_session.query(GameSession)
        .filter(GameSession.user_id == user.id)
        .order_by(GameSession.start_date.desc())
        .all()
    )

    assert [session.status for session in sessions] == [
        "active",
        "active",
        "completed",
        "archived",
        "completed",
    ]
    assert all(session.start_date.year == 2026 for session in sessions)
    assert all(session.end_date.year == 2026 for session in sessions)
    assert all(3 <= session.start_date.month <= 7 for session in sessions)

    history = [session for session in sessions if session.status != "active"]
    assert all(session.completed_at is not None for session in history)
    assert all(session.final_value_krw is not None for session in history)
    assert all(-2.0 < session.final_return_pct < 7.0 for session in history)

    for session in history:
        assert not db_session.query(Holding).filter(
            Holding.user_id == user.id,
            Holding.game_session_id == session.id,
        ).count()
        assert db_session.query(Transaction).filter(
            Transaction.user_id == user.id,
            Transaction.game_session_id == session.id,
        ).count() >= 4
        snapshots = (
            db_session.query(PortfolioSnapshot)
            .filter(
                PortfolioSnapshot.user_id == user.id,
                PortfolioSnapshot.game_session_id == session.id,
            )
            .order_by(PortfolioSnapshot.created_at)
            .all()
        )
        assert len(snapshots) >= 6
        assert all(snapshot.cash_krw >= 0 for snapshot in snapshots)
        assert all(snapshot.total_holdings_value_krw >= 0 for snapshot in snapshots)
        assert snapshots[-1].total_value_krw == session.final_value_krw
        assert snapshots[-1].cash_krw == session.cash_krw

    active = [session for session in sessions if session.status == "active"]
    for session in active:
        assert db_session.query(Holding).filter(
            Holding.user_id == user.id,
            Holding.game_session_id == session.id,
        ).count() >= 3
        assert db_session.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == user.id,
            PortfolioSnapshot.game_session_id == session.id,
        ).count() >= 6


def test_seed_resets_drift_without_duplicating(db_session):
    seed_demo(db_session)
    user = _demo(db_session)
    session = db_session.query(GameSession).filter(
        GameSession.user_id == user.id,
        GameSession.title == "Demo Portfolio",
    ).one()

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
    assert len(sessions) == 5
    tickers = {h.ticker for h in db_session.query(Holding).filter(Holding.user_id == users[0].id)}
    assert "ZZZZ" not in tickers  # drift wiped
    primary = next(item for item in sessions if item.title == "Demo Portfolio")
    assert primary.cash_krw > 0  # baseline restored


def test_seed_never_touches_other_users(db_session):
    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    other = User(
        username="realuser", hashed_password="x",
        balance_krw=5_000.0, balance_usd=1.0,
        created_at=start,
    )
    db_session.add(other)
    db_session.flush()
    other_session = GameSession(
        user_id=other.id,
        title="Keep Session",
        status="active",
        starting_balance_krw=5_000.0,
        starting_balance_usd=1.0,
        cash_krw=5_000.0,
        cash_usd=1.0,
        duration_days=30,
        start_date=start,
        end_date=start + timedelta(days=30),
        is_active=True,
        created_at=start,
    )
    db_session.add(other_session)
    db_session.flush()
    keep = Holding(
        user_id=other.id, game_session_id=other_session.id, ticker="KEEP",
        name="Keep Corp", market="US", quantity=1, avg_price=10.0, currency="USD",
    )
    db_session.add_all([
        keep,
        Transaction(
            user_id=other.id,
            game_session_id=other_session.id,
            ticker="KEEP",
            name="Keep Corp",
            market="US",
            transaction_type="BUY",
            quantity=1,
            price=10.0,
            currency="USD",
            total_amount=10.0,
            realized_pnl=0.0,
            created_at=start,
        ),
        PortfolioSnapshot(
            user_id=other.id,
            game_session_id=other_session.id,
            total_value_krw=5_000.0,
            total_holdings_value_krw=0.0,
            cash_krw=5_000.0,
            cash_usd=1.0,
            exchange_rate=1_500.0,
            created_at=start,
        ),
        Watchlist(user_id=other.id, ticker="KEEP", name="Keep Corp", market="US"),
    ])
    db_session.commit()

    seed_demo(db_session)   # creates demo
    seed_demo(db_session)   # resets demo

    survivors = db_session.query(Holding).filter(Holding.user_id == other.id).all()
    assert [h.ticker for h in survivors] == ["KEEP"]
    assert db_session.query(GameSession).filter(
        GameSession.user_id == other.id,
        GameSession.title == "Keep Session",
    ).count() == 1
    assert db_session.query(Transaction).filter(
        Transaction.user_id == other.id,
        Transaction.ticker == "KEEP",
    ).count() == 1
    assert db_session.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.user_id == other.id,
    ).count() == 1
    assert db_session.query(Watchlist).filter(
        Watchlist.user_id == other.id,
        Watchlist.ticker == "KEEP",
    ).count() == 1
    refreshed = db_session.query(User).filter(User.username == "realuser").one()
    assert refreshed.balance_krw == 5_000.0
    assert refreshed.balance_usd == 1.0
