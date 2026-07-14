from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import GameSession, Holding, User
from app.services.snapshot_service import take_session_snapshot, take_snapshot
from app.services.valuation_service import compute_session_total_value_krw


def create_user(db_session, username="snapshot-user", balance_krw=10_000_000, balance_usd=0.0):
    user = User(username=username, hashed_password="hash", balance_krw=balance_krw, balance_usd=balance_usd)
    db_session.add(user)
    db_session.flush()
    return user


def create_session(
    db_session,
    user,
    *,
    title="Session",
    start_date=None,
    cash_krw=None,
    cash_usd=None,
    is_active=True,
    status="active",
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
        end_date=(start_date or now) + timedelta(days=90),
        is_active=is_active,
    )
    db_session.add(session)
    db_session.flush()
    return session


def create_holding(
    db_session,
    user,
    *,
    session=None,
    ticker="AAPL",
    market="US",
    quantity=1,
    avg_price=100.0,
    currency="USD",
):
    holding = Holding(
        user_id=user.id,
        game_session_id=session.id if session else None,
        ticker=ticker,
        name=ticker,
        market=market,
        sector="Technology",
        industry="Software",
        quantity=quantity,
        avg_price=avg_price,
        currency=currency,
    )
    db_session.add(holding)
    db_session.flush()
    return holding


def price_patch(prices, rate=1300.0):
    return patch.multiple(
        "app.services.snapshot_service",
        get_exchange_rate=lambda: rate,
        get_prices_for_tickers=lambda tickers: {ticker: prices.get(ticker) for ticker in tickers},
    )


class TestSessionSnapshot:
    def test_session_snapshot_writes_game_session_id(self, db_session):
        user = create_user(db_session, balance_krw=5_000_000)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=0.0)
        create_holding(db_session, user, session=session, ticker="005930.KS", market="KRX", quantity=2, currency="KRW")

        with price_patch({"005930.KS": 50_000.0}):
            snapshot = take_session_snapshot(db_session, user.id, session.id)

        assert snapshot.game_session_id == session.id
        assert snapshot.total_holdings_value_krw == 100_000.0
        assert snapshot.total_value_krw == 1_100_000.0

    def test_snapshot_only_includes_holdings_from_selected_session(self, db_session):
        user = create_user(db_session)
        session_a = create_session(db_session, user, title="A", cash_krw=1_000_000, cash_usd=0.0)
        session_b = create_session(db_session, user, title="B", cash_krw=1_000_000, cash_usd=0.0)
        create_holding(db_session, user, session=session_a, ticker="AAPL", quantity=2, currency="USD")
        create_holding(db_session, user, session=session_b, ticker="MSFT", quantity=5, currency="USD")

        with price_patch({"AAPL": 100.0, "MSFT": 200.0}, rate=1300.0):
            snapshot = take_session_snapshot(db_session, user.id, session_a.id)

        assert snapshot.game_session_id == session_a.id
        assert snapshot.total_holdings_value_krw == 260_000.0
        assert snapshot.total_value_krw == 1_260_000.0

    def test_two_sessions_with_same_ticker_do_not_bleed_values(self, db_session):
        user = create_user(db_session)
        session_a = create_session(db_session, user, title="A", cash_krw=0.0, cash_usd=0.0)
        session_b = create_session(db_session, user, title="B", cash_krw=0.0, cash_usd=0.0)
        create_holding(db_session, user, session=session_a, ticker="AAPL", quantity=2, currency="USD")
        create_holding(db_session, user, session=session_b, ticker="AAPL", quantity=7, currency="USD")

        with price_patch({"AAPL": 100.0}, rate=1300.0):
            snapshot = take_session_snapshot(db_session, user.id, session_a.id)

        assert snapshot.total_holdings_value_krw == 260_000.0
        assert snapshot.total_value_krw == 260_000.0

    def test_session_cash_is_used_instead_of_user_balance_when_initialized(self, db_session):
        user = create_user(db_session, balance_krw=9_000_000, balance_usd=99.0)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=2.0)

        with price_patch({}, rate=1300.0):
            snapshot = take_session_snapshot(db_session, user.id, session.id)

        assert snapshot.cash_krw == 1_000_000
        assert snapshot.cash_usd == 2.0
        assert snapshot.total_value_krw == 1_002_600.0

    def test_null_session_cash_initializes_from_user_balance(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000, balance_usd=5.0)
        session = create_session(db_session, user, cash_krw=None, cash_usd=None)

        with price_patch({}, rate=1300.0):
            snapshot = take_session_snapshot(db_session, user.id, session.id)

        assert session.cash_krw == 3_000_000
        assert session.cash_usd == 5.0
        assert snapshot.cash_krw == 3_000_000
        assert snapshot.cash_usd == 5.0
        assert snapshot.total_value_krw == 3_006_500.0


class TestSnapshotCompatibilityWrapper:
    def test_take_snapshot_uses_current_session_when_holdings_are_scoped(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=0.0)
        create_holding(db_session, user, session=session, ticker="AAPL", quantity=1, currency="USD")

        with price_patch({"AAPL": 100.0}, rate=1300.0):
            snapshot = take_snapshot(db_session, user.id)

        assert snapshot.game_session_id == session.id
        assert snapshot.total_value_krw == 1_130_000.0

    def test_take_snapshot_preserves_legacy_behavior_when_holdings_are_unscoped(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000, balance_usd=1.0)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=0.0)
        create_holding(db_session, user, session=None, ticker="AAPL", quantity=1, currency="USD")

        with price_patch({"AAPL": 100.0}, rate=1300.0):
            snapshot = take_snapshot(db_session, user.id)

        assert snapshot.game_session_id is None
        assert snapshot.cash_krw == user.balance_krw
        assert snapshot.total_value_krw == 3_131_300.0
        assert session.cash_krw == 1_000_000

    def test_take_snapshot_keeps_legacy_precedence_for_mixed_holdings(self, db_session):
        user = create_user(db_session, balance_krw=3_000_000, balance_usd=1.0)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=0.0)
        create_holding(
            db_session,
            user,
            session=session,
            ticker="AAPL",
            quantity=1,
            currency="USD",
        )
        create_holding(
            db_session,
            user,
            session=None,
            ticker="MSFT",
            quantity=1,
            currency="USD",
        )

        with price_patch({"AAPL": 100.0, "MSFT": 200.0}, rate=1300.0):
            snapshot = take_snapshot(db_session, user.id)

        assert snapshot.game_session_id is None
        assert snapshot.cash_krw == user.balance_krw
        assert snapshot.total_holdings_value_krw == 390_000.0
        assert snapshot.total_value_krw == 3_391_300.0
        assert session.cash_krw == 1_000_000

    def test_take_snapshot_handles_no_current_session_with_legacy_snapshot(self, db_session):
        user = create_user(db_session, balance_krw=2_000_000, balance_usd=1.0)
        create_holding(db_session, user, session=None, ticker="AAPL", quantity=2, currency="USD")

        with price_patch({"AAPL": 100.0}, rate=1300.0):
            snapshot = take_snapshot(db_session, user.id)

        assert snapshot.game_session_id is None
        assert snapshot.total_holdings_value_krw == 260_000.0
        assert snapshot.total_value_krw == 2_261_300.0


class TestSessionValuation:
    def test_compute_session_total_value_uses_session_cash_and_holdings(self, db_session):
        user = create_user(db_session, balance_krw=9_000_000, balance_usd=99.0)
        session = create_session(db_session, user, cash_krw=1_000_000, cash_usd=2.0)
        holding = create_holding(db_session, user, session=session, ticker="AAPL", quantity=2, currency="USD")

        total = compute_session_total_value_krw(session, [holding], 1300.0, {"AAPL": 100.0})

        assert total == 1_262_600.0
