from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, Watchlist


STOCK_TICKER = "AAPL"
POPULAR_TICKER = "NVDA"


def stock_info(ticker):
    return {
        "ticker": ticker,
        "price": 100.0,
        "currency": "USD",
        "name": f"{ticker} Test Corp",
        "name_en": f"{ticker} Test Corp",
        "name_ko": f"{ticker} Test Corp",
        "market": "US",
        "sector": "Technology",
        "industry": "Software",
    }


def search_results(query):
    return [
        {
            "ticker": STOCK_TICKER,
            "name": "Apple",
            "name_en": "Apple",
            "name_ko": "Apple",
            "exchange": "NASDAQ/NYSE",
            "type": "EQUITY",
        }
    ]


def top_30(market):
    assert market == "US"
    return [
        {
            "rank": 1,
            "ticker": POPULAR_TICKER,
            "name": "NVIDIA",
            "price": 100.0,
            "change": 1.0,
            "change_pct": 1.0,
            "currency": "USD",
        }
    ]


def prices_for_tickers(tickers):
    return {ticker: 100.0 for ticker in tickers}


def infos_for_tickers(tickers):
    return {
        ticker: {"sector": "Technology", "industry": "Software"}
        for ticker in tickers
    }


def create_session(client, headers, title):
    response = client.post(
        "/game/sessions",
        json={
            "title": title,
            "duration_days": 7,
            "starting_balance_krw": 1_000_000,
            "starting_balance_usd": 0,
        },
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()["session"]


def assert_tickers(items, expected):
    assert [item["ticker"] for item in items] == expected


def test_session_user_flow_regression_smoke(client, db_session):
    """High-value route smoke for session-scoped game behavior.

    This intentionally stays API-level: frontend browser clicks are covered by
    the lightweight navigation source check and the manual QA checklist.
    """

    route_patches = [
        patch("app.routes.stocks.get_stock_info", side_effect=stock_info),
        patch("app.routes.stocks.search_stocks", side_effect=search_results),
        patch("app.routes.stocks.get_top_30", side_effect=top_30),
        patch("app.routes.watchlist.get_stock_info", side_effect=stock_info),
        patch("app.routes.watchlist.get_prices_for_tickers", side_effect=prices_for_tickers),
        patch("app.routes.portfolio.get_prices_for_tickers", side_effect=prices_for_tickers),
        patch("app.routes.portfolio.get_infos_for_tickers", side_effect=infos_for_tickers),
        patch("app.routes.analytics.get_prices_for_tickers", side_effect=prices_for_tickers),
        patch("app.routes.analytics.get_infos_for_tickers", side_effect=infos_for_tickers),
        patch("app.routes.game.get_prices_for_tickers", side_effect=prices_for_tickers),
        patch("app.routes.game.get_infos_for_tickers", side_effect=infos_for_tickers),
    ]

    with ExitStack() as stack:
        for route_patch in route_patches:
            stack.enter_context(route_patch)

        register = client.post(
            "/auth/register",
            json={"username": "smoke_user", "password": "smoke-pass-123"},
        )
        assert register.status_code == 201

        login = client.post(
            "/auth/login",
            json={"username": "smoke_user", "password": "smoke-pass-123"},
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        session_a = create_session(client, headers, "Smoke A")
        session_b = create_session(client, headers, "Smoke B")

        sessions = client.get("/game/sessions?include_all=true", headers=headers)
        assert sessions.status_code == 200
        session_ids = {session["id"] for session in sessions.json()["sessions"]}
        assert {session_a["id"], session_b["id"]}.issubset(session_ids)

        search = client.get(f"/stock/search/{STOCK_TICKER}", headers=headers)
        assert search.status_code == 200
        assert_tickers(search.json(), [STOCK_TICKER])

        stock_detail = client.get(f"/stock/{STOCK_TICKER}", headers=headers)
        assert stock_detail.status_code == 200
        assert stock_detail.json()["ticker"] == STOCK_TICKER

        popular = client.get("/market/top30/US", headers=headers)
        assert popular.status_code == 200
        assert_tickers(popular.json(), [POPULAR_TICKER])
        popular_detail = client.get(f"/stock/{popular.json()[0]['ticker']}", headers=headers)
        assert popular_detail.status_code == 200
        assert popular_detail.json()["ticker"] == POPULAR_TICKER

        add_watchlist = client.post(
            f"/watchlist/add?ticker={STOCK_TICKER}",
            headers=headers,
        )
        assert add_watchlist.status_code == 200
        contains = client.get(
            f"/watchlist/contains?ticker={STOCK_TICKER}",
            headers=headers,
        )
        assert contains.status_code == 200
        assert contains.json()["in_watchlist"] is True
        watchlist = client.get("/watchlist/", headers=headers)
        assert watchlist.status_code == 200
        assert_tickers(watchlist.json(), [STOCK_TICKER])

        exchange = client.post(
            f"/game/sessions/{session_a['id']}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 260_000},
            headers=headers,
        )
        assert exchange.status_code == 200
        assert exchange.json()["balance"] == {"krw": 740_000, "usd": 200}

        buy = client.post(
            f"/game/sessions/{session_a['id']}/trade/buy",
            json={"ticker": STOCK_TICKER, "quantity": 2},
            headers=headers,
        )
        assert buy.status_code == 200
        assert buy.json()["balance"] == {"krw": 740_000, "usd": 0}

        sell = client.post(
            f"/game/sessions/{session_a['id']}/trade/sell",
            json={"ticker": STOCK_TICKER, "quantity": 1},
            headers=headers,
        )
        assert sell.status_code == 200
        assert sell.json()["balance"] == {"krw": 740_000, "usd": 100.0}

        account_a = client.get(
            f"/game/sessions/{session_a['id']}/portfolio/account",
            headers=headers,
        )
        assert account_a.status_code == 200
        assert account_a.json()["balance_krw"] == 740_000
        assert account_a.json()["balance_usd"] == 100.0

        holdings_a = client.get(
            f"/game/sessions/{session_a['id']}/portfolio/holdings",
            headers=headers,
        )
        assert holdings_a.status_code == 200
        assert [(row["ticker"], row["quantity"]) for row in holdings_a.json()] == [
            (STOCK_TICKER, 1)
        ]

        account_b = client.get(
            f"/game/sessions/{session_b['id']}/portfolio/account",
            headers=headers,
        )
        assert account_b.status_code == 200
        assert account_b.json()["balance_krw"] == 1_000_000
        assert account_b.json()["balance_usd"] == 0

        holdings_b = client.get(
            f"/game/sessions/{session_b['id']}/portfolio/holdings",
            headers=headers,
        )
        assert holdings_b.status_code == 200
        assert holdings_b.json() == []

        transactions_a = client.get(
            f"/game/sessions/{session_a['id']}/portfolio/transactions",
            headers=headers,
        )
        assert transactions_a.status_code == 200
        assert {row["transaction_type"] for row in transactions_a.json()} == {
            "EXCHANGE",
            "BUY",
            "SELL",
        }

        for path in (
            "performance",
            "by-stock",
            "by-sector",
            "realized",
        ):
            analytics = client.get(
                f"/game/sessions/{session_a['id']}/analytics/{path}",
                headers=headers,
            )
            assert analytics.status_code == 200

        by_stock = client.get(
            f"/game/sessions/{session_a['id']}/analytics/by-stock",
            headers=headers,
        )
        assert by_stock.json()[0]["ticker"] == STOCK_TICKER
        assert by_stock.json()[0]["quantity"] == 1

        other_register = client.post(
            "/auth/register",
            json={"username": "other_smoke_user", "password": "smoke-pass-123"},
        )
        assert other_register.status_code == 201
        other_headers = {
            "Authorization": f"Bearer {other_register.json()['access_token']}"
        }
        cross_user = client.get(
            f"/game/sessions/{session_b['id']}",
            headers=other_headers,
        )
        assert cross_user.status_code == 404

        archive = client.patch(
            f"/game/sessions/{session_a['id']}",
            json={"status": "archived"},
            headers=headers,
        )
        assert archive.status_code == 200
        assert archive.json()["session"]["status"] == "archived"

        archived_buy = client.post(
            f"/game/sessions/{session_a['id']}/trade/buy",
            json={"ticker": STOCK_TICKER, "quantity": 1},
            headers=headers,
        )
        archived_exchange = client.post(
            f"/game/sessions/{session_a['id']}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 10_000},
            headers=headers,
        )
        assert archived_buy.status_code == 400
        assert archived_exchange.status_code == 400

        expired = create_session(client, headers, "Smoke Expired")
        expired_model = (
            db_session.query(GameSession).filter_by(id=expired["id"]).one()
        )
        expired_model.end_date = datetime.now(timezone.utc) - timedelta(days=1)
        db_session.commit()

        expired_buy = client.post(
            f"/game/sessions/{expired['id']}/trade/buy",
            json={"ticker": STOCK_TICKER, "quantity": 1},
            headers=headers,
        )
        expired_exchange = client.post(
            f"/game/sessions/{expired['id']}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 10_000},
            headers=headers,
        )
        assert expired_buy.status_code == 400
        assert expired_exchange.status_code == 400

        delete = client.delete(
            f"/game/sessions/{session_a['id']}",
            headers=headers,
        )
        assert delete.status_code == 200
        assert delete.json()["deleted_session_id"] == session_a["id"]

        assert db_session.query(GameSession).filter_by(id=session_a["id"]).count() == 0
        assert db_session.query(Holding).filter_by(game_session_id=session_a["id"]).count() == 0
        assert db_session.query(Transaction).filter_by(game_session_id=session_a["id"]).count() == 0
        assert (
            db_session.query(PortfolioSnapshot)
            .filter_by(game_session_id=session_a["id"])
            .count()
            == 0
        )
        assert db_session.query(GameSession).filter_by(id=session_b["id"]).count() == 1
        assert db_session.query(Watchlist).count() == 1

        still_global_watchlist = client.get("/watchlist/", headers=headers)
        assert still_global_watchlist.status_code == 200
        assert_tickers(still_global_watchlist.json(), [STOCK_TICKER])

        remove_watchlist = client.delete(
            f"/watchlist/remove/{STOCK_TICKER}",
            headers=headers,
        )
        assert remove_watchlist.status_code == 200
        contains_after_remove = client.get(
            f"/watchlist/contains?ticker={STOCK_TICKER}",
            headers=headers,
        )
        assert contains_after_remove.json()["in_watchlist"] is False
