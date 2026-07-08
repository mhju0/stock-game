from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User, Watchlist


def current_user(db_session, registered_user):
    return db_session.query(User).filter(User.id == registered_user["user_id"]).first()


def create_session(
    db_session,
    user,
    *,
    title="Session",
    status="active",
    is_active=True,
    cash_krw=10_000_000,
    cash_usd=0.0,
    starting_balance_krw=10_000_000,
    start_offset_days=0,
):
    now = datetime.now(timezone.utc)
    start_date = now + timedelta(days=start_offset_days)
    session = GameSession(
        user_id=user.id,
        title=title,
        status=status,
        starting_balance_krw=starting_balance_krw,
        starting_balance_usd=0.0,
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        duration_days=90,
        start_date=start_date,
        end_date=start_date + timedelta(days=90),
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
    ticker="KB",
    quantity=1,
    avg_price=1000.0,
    market="KRX",
    currency="KRW",
):
    holding = Holding(
        user_id=user.id,
        game_session_id=session.id if session else None,
        ticker=ticker,
        name=f"{ticker} Corp",
        market=market,
        sector="Finance",
        industry="Banking",
        quantity=quantity,
        avg_price=avg_price,
        currency=currency,
    )
    db_session.add(holding)
    db_session.flush()
    return holding


def create_transaction(
    db_session,
    user,
    *,
    session=None,
    ticker="KB",
    quantity=1,
    created_at=None,
):
    tx = Transaction(
        user_id=user.id,
        game_session_id=session.id if session else None,
        ticker=ticker,
        name=f"{ticker} Corp",
        market="KRX",
        transaction_type="BUY",
        quantity=quantity,
        price=1000.0,
        currency="KRW",
        sector="Finance",
        industry="Banking",
        total_amount=quantity * 1000.0,
        realized_pnl=0.0,
        created_at=created_at or datetime.now(timezone.utc),
    )
    db_session.add(tx)
    db_session.flush()
    return tx


def create_snapshot(
    db_session,
    user,
    *,
    session=None,
    total_value_krw=1_000_000,
    created_at=None,
):
    snapshot = PortfolioSnapshot(
        user_id=user.id,
        game_session_id=session.id if session else None,
        total_value_krw=total_value_krw,
        total_holdings_value_krw=0.0,
        cash_krw=total_value_krw,
        cash_usd=0.0,
        exchange_rate=1300.0,
        created_at=created_at or datetime.now(timezone.utc),
    )
    db_session.add(snapshot)
    db_session.flush()
    return snapshot


def portfolio_patches(prices=None, rate=1300.0):
    price_map = prices or {}
    return patch.multiple(
        "app.routes.portfolio",
        get_exchange_rate=lambda: rate,
        get_prices_for_tickers=lambda tickers: {
            ticker: price_map.get(ticker, 1000.0) for ticker in tickers
        },
        get_infos_for_tickers=lambda tickers: {
            ticker: {"sector": "Finance", "industry": "Banking"} for ticker in tickers
        },
    )


class TestSessionScopedPortfolioRoutes:
    def test_explicit_session_account_uses_selected_session_cash(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A", cash_krw=1_000_000)
        session_b = create_session(db_session, user, title="B", cash_krw=2_000_000)
        create_holding(db_session, user, session=session_a, ticker="KB", quantity=99)
        create_holding(db_session, user, session=session_b, ticker="KB", quantity=2)

        with portfolio_patches({"KB": 5000.0}):
            resp = client.get(
                f"/game/sessions/{session_b.id}/portfolio/account",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["balance_krw"] == 2_000_000
        assert body["holdings_value_krw"] == 10_000
        assert body["total_value_krw"] == 2_010_000
        assert body["starting_value"] == session_b.starting_balance_krw

    def test_explicit_session_account_initializes_null_cash_from_user_balance(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        user.balance_krw = 3_000_000
        user.balance_usd = 7.0
        session = create_session(db_session, user, cash_krw=None, cash_usd=None)

        with portfolio_patches({}):
            resp = client.get(
                f"/game/sessions/{session.id}/portfolio/account",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        db_session.refresh(session)
        assert session.cash_krw == 3_000_000
        assert session.cash_usd == 7.0
        assert resp.json()["balance_krw"] == 3_000_000
        assert resp.json()["balance_usd"] == 7.0

    def test_explicit_session_holdings_returns_only_selected_session_holdings(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_holding(db_session, user, session=session_a, ticker="AAA", quantity=3)
        create_holding(db_session, user, session=session_b, ticker="BBB", quantity=7)
        create_holding(db_session, user, session=None, ticker="LEGACY", quantity=11)

        with portfolio_patches({"AAA": 1000.0, "BBB": 1000.0, "LEGACY": 1000.0}):
            resp = client.get(
                f"/game/sessions/{session_a.id}/portfolio/holdings",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert [(h["ticker"], h["quantity"]) for h in resp.json()] == [("AAA", 3)]

    def test_explicit_session_transactions_returns_only_selected_session_transactions(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_transaction(db_session, user, session=session_a, ticker="AAA")
        create_transaction(db_session, user, session=session_b, ticker="BBB")
        create_transaction(db_session, user, session=None, ticker="LEGACY")

        resp = client.get(
            f"/game/sessions/{session_a.id}/portfolio/transactions",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        assert [t["ticker"] for t in resp.json()] == ["AAA"]

    def test_explicit_session_snapshots_returns_only_selected_session_snapshots(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_snapshot(db_session, user, session=session_a, total_value_krw=1_100_000)
        create_snapshot(db_session, user, session=session_b, total_value_krw=2_200_000)
        create_snapshot(db_session, user, session=None, total_value_krw=9_900_000)

        resp = client.get(
            f"/game/sessions/{session_a.id}/portfolio/snapshots",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        assert [s["total_value_krw"] for s in resp.json()] == [1_100_000]

    def test_two_sessions_with_same_ticker_do_not_bleed_in_portfolio_holdings(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_holding(db_session, user, session=session_a, ticker="KB", quantity=2)
        create_holding(db_session, user, session=session_b, ticker="KB", quantity=8)

        with portfolio_patches({"KB": 1000.0}):
            resp = client.get(
                f"/game/sessions/{session_a.id}/portfolio/holdings",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert resp.json()[0]["ticker"] == "KB"
        assert resp.json()[0]["quantity"] == 2

    def test_cross_user_session_portfolio_read_returns_404(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other, cash_krw=1_000_000)

        resp = client.get(
            f"/game/sessions/{other_session.id}/portfolio/account",
            headers=auth_headers,
        )

        assert resp.status_code == 404


class TestPortfolioCompatibilityRoutes:
    def test_old_portfolio_account_uses_current_session_when_available(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        current = create_session(
            db_session,
            user,
            title="Current",
            cash_krw=1_500_000,
            start_offset_days=1,
        )
        create_holding(db_session, user, session=current, ticker="KB", quantity=2)
        create_holding(db_session, user, session=None, ticker="KB", quantity=99)

        with portfolio_patches({"KB": 1000.0}):
            resp = client.get("/portfolio/account", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.json()
        assert body["balance_krw"] == 1_500_000
        assert body["holdings_value_krw"] == 2_000
        assert body["total_value_krw"] == 1_502_000

    def test_old_portfolio_holdings_uses_current_session_when_available(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        current = create_session(db_session, user, title="Current", start_offset_days=1)
        create_holding(db_session, user, session=current, ticker="KB", quantity=4)
        create_holding(db_session, user, session=None, ticker="KB", quantity=10)

        with portfolio_patches({"KB": 1000.0}):
            resp = client.get("/portfolio/holdings", headers=auth_headers)

        assert resp.status_code == 200
        assert [(h["ticker"], h["quantity"]) for h in resp.json()] == [("KB", 4)]

    def test_no_current_session_legacy_fallback_still_works(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        user.balance_krw = 2_000_000
        create_session(db_session, user, title="Inactive", is_active=False, status="completed")
        create_holding(db_session, user, session=None, ticker="LEGACY", quantity=3)

        with portfolio_patches({"LEGACY": 1000.0}):
            account_resp = client.get("/portfolio/account", headers=auth_headers)
            holdings_resp = client.get("/portfolio/holdings", headers=auth_headers)

        assert account_resp.status_code == 200
        assert account_resp.json()["balance_krw"] == 2_000_000
        assert account_resp.json()["holdings_value_krw"] == 3_000
        assert holdings_resp.status_code == 200
        assert [(h["ticker"], h["quantity"]) for h in holdings_resp.json()] == [
            ("LEGACY", 3)
        ]

    def test_old_portfolio_holdings_falls_back_to_unscoped_compatibility_rows(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        create_session(db_session, user, title="Current", start_offset_days=1)
        create_holding(db_session, user, session=None, ticker="LEGACY", quantity=5)

        with portfolio_patches({"LEGACY": 1000.0}):
            resp = client.get("/portfolio/holdings", headers=auth_headers)

        assert resp.status_code == 200
        assert [(h["ticker"], h["quantity"]) for h in resp.json()] == [("LEGACY", 5)]

    def test_watchlist_remains_untouched_by_portfolio_reads(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session = create_session(db_session, user)
        db_session.add(Watchlist(user_id=user.id, ticker="KB", name="KB Corp", market="KRX"))
        db_session.flush()

        with portfolio_patches({}):
            resp = client.get(
                f"/game/sessions/{session.id}/portfolio/holdings",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert db_session.query(Watchlist).filter_by(user_id=user.id).count() == 1
