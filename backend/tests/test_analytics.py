from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User


def current_user(db_session, registered_user):
    return db_session.query(User).filter(User.id == registered_user["user_id"]).first()


def create_session(
    db_session,
    user,
    *,
    title="Session",
    status="active",
    is_active=True,
    cash_krw=1_000_000,
    cash_usd=0.0,
    starting_balance_krw=1_000_000,
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
    sector="Finance",
    industry="Banking",
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
        sector=sector,
        industry=industry,
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
    transaction_type="SELL",
    quantity=1,
    realized_pnl=0.0,
    created_at=None,
):
    tx = Transaction(
        user_id=user.id,
        game_session_id=session.id if session else None,
        ticker=ticker,
        name=f"{ticker} Corp",
        market="KRX",
        transaction_type=transaction_type,
        quantity=quantity,
        price=1000.0,
        currency="KRW",
        sector="Finance",
        industry="Banking",
        total_amount=quantity * 1000.0,
        realized_pnl=realized_pnl,
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


def analytics_patches(prices=None, rate=1300.0):
    price_map = prices or {}
    return patch.multiple(
        "app.routes.analytics",
        get_exchange_rate=lambda: rate,
        get_prices_for_tickers=lambda tickers: {
            ticker: price_map.get(ticker, 1000.0) for ticker in tickers
        },
        get_infos_for_tickers=lambda tickers: {
            ticker: {"sector": "Finance", "industry": "Banking"} for ticker in tickers
        },
    )


class TestSessionScopedAnalytics:
    def test_explicit_session_performance_uses_only_selected_session_data(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A", cash_krw=1_000_000)
        session_b = create_session(db_session, user, title="B", cash_krw=2_000_000)
        create_holding(db_session, user, session=session_a, ticker="KB", quantity=2)
        create_holding(db_session, user, session=session_b, ticker="KB", quantity=10)
        create_snapshot(db_session, user, session=session_a, total_value_krw=1_100_000)
        create_snapshot(db_session, user, session=session_b, total_value_krw=2_500_000)

        with analytics_patches({"KB": 1000.0}):
            resp = client.get(
                f"/game/sessions/{session_a.id}/analytics/performance",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["starting_value"] == 1_000_000
        assert body["current_value"] == 1_002_000
        assert [s["value"] for s in body["snapshots"]] == [1_100_000]

    def test_explicit_session_by_stock_uses_only_selected_holdings_and_transactions(
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
        create_holding(db_session, user, session=session_b, ticker="KB", quantity=9)
        create_transaction(db_session, user, session=session_a, ticker="KB", realized_pnl=120)
        create_transaction(db_session, user, session=session_b, ticker="KB", realized_pnl=900)

        with analytics_patches({"KB": 1100.0}):
            resp = client.get(
                f"/game/sessions/{session_a.id}/analytics/by-stock",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["ticker"] == "KB"
        assert body[0]["quantity"] == 2
        assert body[0]["realized_pnl"] == 120

    def test_explicit_session_by_sector_uses_only_selected_holdings(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_holding(db_session, user, session=session_a, ticker="AAA", quantity=2)
        create_holding(db_session, user, session=session_b, ticker="BBB", quantity=9)

        with analytics_patches({"AAA": 1000.0, "BBB": 1000.0}):
            resp = client.get(
                f"/game/sessions/{session_a.id}/analytics/by-sector",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert resp.json() == [
            {
                "sector": "Finance",
                "total_value_krw": 2000.0,
                "pnl_krw": 0.0,
                "pnl_pct": 0.0,
                "allocation_pct": 100.0,
                "stock_count": 1,
                "stocks": ["AAA"],
            }
        ]

    def test_explicit_session_realized_uses_only_selected_sell_transactions(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_transaction(db_session, user, session=session_a, ticker="WIN", realized_pnl=150)
        create_transaction(db_session, user, session=session_a, ticker="LOSS", realized_pnl=-50)
        create_transaction(db_session, user, session=session_a, ticker="BUY", transaction_type="BUY")
        create_transaction(db_session, user, session=session_b, ticker="OTHER", realized_pnl=999)
        create_transaction(db_session, user, session=None, ticker="LEGACY", realized_pnl=888)

        resp = client.get(
            f"/game/sessions/{session_a.id}/analytics/realized",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["total_realized_pnl"] == 100
        assert body["total_trades"] == 2
        assert body["winning_trades"] == 1
        assert body["losing_trades"] == 1
        assert body["best_trade"] == {"ticker": "WIN", "pnl": 150.0}
        assert body["worst_trade"] == {"ticker": "LOSS", "pnl": -50.0}

    def test_two_sessions_with_same_ticker_do_not_bleed_by_stock(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A")
        session_b = create_session(db_session, user, title="B")
        create_holding(db_session, user, session=session_a, ticker="KB", quantity=3)
        create_holding(db_session, user, session=session_b, ticker="KB", quantity=8)

        with analytics_patches({"KB": 1000.0}):
            resp = client.get(
                f"/game/sessions/{session_a.id}/analytics/by-stock",
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert [(row["ticker"], row["quantity"]) for row in resp.json()] == [("KB", 3)]

    def test_cross_user_session_analytics_returns_404(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other)

        resp = client.get(
            f"/game/sessions/{other_session.id}/analytics/performance",
            headers=auth_headers,
        )

        assert resp.status_code == 404


class TestAnalyticsCompatibility:
    def test_compatibility_routes_preserve_grouped_selection_in_mixed_state(
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
            cash_krw=1_000_000,
            start_offset_days=1,
        )
        create_holding(db_session, user, session=current, ticker="SCOPED", quantity=2)
        create_transaction(
            db_session,
            user,
            session=None,
            ticker="LEGACY_TX",
            realized_pnl=75,
        )
        create_snapshot(db_session, user, session=None, total_value_krw=9_900_000)

        with analytics_patches({"SCOPED": 1000.0}):
            performance_resp = client.get("/analytics/performance", headers=auth_headers)
            stock_resp = client.get("/analytics/by-stock", headers=auth_headers)
            realized_resp = client.get("/analytics/realized", headers=auth_headers)

        assert performance_resp.status_code == 200
        assert performance_resp.json()["current_value"] == 1_002_000
        assert performance_resp.json()["snapshots"] == []
        assert stock_resp.status_code == 200
        assert [(row["ticker"], row["realized_pnl"]) for row in stock_resp.json()] == [
            ("SCOPED", 0)
        ]
        assert realized_resp.status_code == 200
        assert realized_resp.json()["total_realized_pnl"] == 75

    def test_old_analytics_routes_use_current_session_when_available(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        current = create_session(db_session, user, title="Current", start_offset_days=1)
        create_holding(db_session, user, session=current, ticker="KB", quantity=4)
        create_holding(db_session, user, session=None, ticker="KB", quantity=99)
        create_snapshot(db_session, user, session=current, total_value_krw=1_100_000)
        create_snapshot(db_session, user, session=None, total_value_krw=9_900_000)
        create_transaction(db_session, user, session=current, ticker="KB", realized_pnl=10)
        create_transaction(db_session, user, session=None, ticker="KB", realized_pnl=999)

        with analytics_patches({"KB": 1000.0}):
            perf_resp = client.get("/analytics/performance", headers=auth_headers)
            stock_resp = client.get("/analytics/by-stock", headers=auth_headers)
            realized_resp = client.get("/analytics/realized", headers=auth_headers)

        assert perf_resp.status_code == 200
        assert perf_resp.json()["current_value"] == 1_004_000
        assert [s["value"] for s in perf_resp.json()["snapshots"]] == [1_100_000]
        assert [(row["ticker"], row["quantity"]) for row in stock_resp.json()] == [
            ("KB", 4)
        ]
        assert realized_resp.json()["total_realized_pnl"] == 10

    def test_old_analytics_legacy_no_current_session_fallback_still_works(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        user.balance_krw = 2_000_000
        create_session(db_session, user, title="Inactive", status="completed", is_active=False)
        create_holding(db_session, user, session=None, ticker="LEGACY", quantity=3)
        create_snapshot(db_session, user, session=None, total_value_krw=2_100_000)
        create_transaction(db_session, user, session=None, ticker="LEGACY", realized_pnl=75)

        with analytics_patches({"LEGACY": 1000.0}):
            perf_resp = client.get("/analytics/performance", headers=auth_headers)
            stock_resp = client.get("/analytics/by-stock", headers=auth_headers)
            realized_resp = client.get("/analytics/realized", headers=auth_headers)

        assert perf_resp.status_code == 200
        assert perf_resp.json()["current_value"] == 2_003_000
        assert [s["value"] for s in perf_resp.json()["snapshots"]] == [2_100_000]
        assert [(row["ticker"], row["quantity"]) for row in stock_resp.json()] == [
            ("LEGACY", 3)
        ]
        assert realized_resp.json()["total_realized_pnl"] == 75
