"""
Trading tests — buy/sell paths with mocked stock data (no yfinance).
All monetary assertions check the actual DB state via the response body.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User, Watchlist


TICKER = "AAPL"
MOCK_PRICE = 100.0          # set in conftest MOCK_STOCK_INFO
INITIAL_USD = 0.0
INITIAL_KRW = 10_000_000.0  # User model default


def current_user(db_session, registered_user):
    return db_session.query(User).filter(User.id == registered_user["user_id"]).first()


def create_game_session(
    db_session,
    user,
    *,
    status="active",
    is_active=True,
    cash_krw=10_000_000,
    cash_usd=0.0,
    end_date=None,
):
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id,
        title="Test Session",
        status=status,
        starting_balance_krw=10_000_000,
        starting_balance_usd=0.0,
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        duration_days=90,
        start_date=now - timedelta(days=1),
        end_date=end_date or (now + timedelta(days=90)),
        is_active=is_active,
    )
    db_session.add(session)
    db_session.flush()
    return session


def create_session_holding(
    db_session,
    user,
    session,
    ticker="KB",
    quantity=5,
    avg_price=1000.0,
    market="KRX",
    currency="KRW",
):
    holding = Holding(
        user_id=user.id,
        game_session_id=session.id,
        ticker=ticker,
        name="Test KRW",
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


def krw_stock(price=1000.0, ticker_name="Test KRW"):
    return {
        "price": price,
        "currency": "KRW",
        "name": ticker_name,
        "market": "KRX",
        "sector": "Finance",
        "industry": "Banking",
    }


class TestBuyStock:
    def _buy(self, client, headers, qty=1, ticker=TICKER):
        return client.post("/trade/buy", json={"ticker": ticker, "quantity": qty}, headers=headers)

    def test_buy_reduces_usd_balance(self, client, registered_user, auth_headers):
        # Give user USD first via the registered defaults (KRW=10M, USD=0)
        # MOCK_STOCK_INFO has currency=USD, price=100.0
        # User starts with 0 USD → buy should fail (insufficient balance)
        resp = self._buy(client, auth_headers, qty=1)
        assert resp.status_code == 400
        assert "Insufficient" in resp.json()["detail"]

    def test_buy_krw_stock_reduces_krw_balance(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        krw_stock = {
            "price": 50_000.0,
            "currency": "KRW",
            "name": "Samsung",
            "market": "KRX",
            "sector": "Technology",
            "industry": "Semiconductors",
        }
        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock), \
             patch("app.services.trading_service.get_stock_price", return_value=50_000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=50_000.0):
            resp = client.post(
                "/trade/buy",
                json={"ticker": "005930.KS", "quantity": 2},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        body = resp.json()
        expected_krw = INITIAL_KRW - 50_000.0 * 2
        assert body["balance"]["krw"] == expected_krw
        assert body["transaction"]["quantity"] == 2

    def test_buy_adds_holding(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        krw_stock = {
            "price": 1000.0,
            "currency": "KRW",
            "name": "Test KRW Stock",
            "market": "KRX",
            "sector": "Finance",
            "industry": "Banking",
        }
        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                "/trade/buy",
                json={"ticker": "KB", "quantity": 5},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert resp.json()["transaction"]["quantity"] == 5


class TestSellStock:
    def _buy_krw(self, client, headers, ticker="KB", qty=10, price=1000.0):
        """Helper: buy a KRW stock so we have something to sell."""
        from unittest.mock import patch

        krw_stock = {
            "price": price,
            "currency": "KRW",
            "name": "Test KRW",
            "market": "KRX",
            "sector": "Finance",
            "industry": "Banking",
        }
        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock), \
             patch("app.services.trading_service.get_stock_price", return_value=price), \
             patch("app.services.snapshot_service.get_stock_price", return_value=price):
            return client.post("/trade/buy", json={"ticker": ticker, "quantity": qty}, headers=headers)

    def test_sell_increases_krw_balance(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        BUY_PRICE = 1000.0
        SELL_PRICE = 1200.0
        QTY = 5

        self._buy_krw(client, auth_headers, qty=QTY, price=BUY_PRICE)

        with patch("app.services.trading_service.get_stock_price", return_value=SELL_PRICE), \
             patch("app.services.snapshot_service.get_stock_price", return_value=SELL_PRICE):
            resp = client.post("/trade/sell", json={"ticker": "KB", "quantity": QTY}, headers=auth_headers)

        assert resp.status_code == 200
        body = resp.json()
        # After buy+sell at higher price, KRW should be > starting (profit)
        assert body["balance"]["krw"] > INITIAL_KRW - BUY_PRICE * QTY
        assert body["transaction"]["type"] == "SELL"
        assert body["transaction"]["quantity"] == QTY

    def test_sell_removes_holding_when_fully_sold(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        QTY = 3
        PRICE = 2000.0

        self._buy_krw(client, auth_headers, qty=QTY, price=PRICE)

        with patch("app.services.trading_service.get_stock_price", return_value=PRICE), \
             patch("app.services.snapshot_service.get_stock_price", return_value=PRICE):
            resp = client.post("/trade/sell", json={"ticker": "KB", "quantity": QTY}, headers=auth_headers)

        assert resp.status_code == 200
        # Balance should be back to initial (bought and sold at same price)
        assert resp.json()["balance"]["krw"] == INITIAL_KRW


class TestInvalidTrades:
    def test_buy_over_budget_rejected_and_balance_unchanged(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        # User starts with 0 USD; MOCK_STOCK_INFO uses USD
        resp = client.post(
            "/trade/buy",
            json={"ticker": TICKER, "quantity": 1},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "Insufficient" in resp.json()["detail"]

    def test_sell_without_holding_rejected(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        with patch("app.services.trading_service.get_stock_info", return_value={
            "price": 100.0, "currency": "USD", "name": "Ghost", "market": "NASDAQ",
            "sector": "X", "industry": "Y",
        }):
            resp = client.post("/trade/sell", json={"ticker": "GHOST", "quantity": 1}, headers=auth_headers)

        assert resp.status_code == 400

    def test_sell_more_than_held_rejected(self, client, registered_user, auth_headers):
        from unittest.mock import patch

        # Buy 2 shares
        krw_stock = {
            "price": 1000.0, "currency": "KRW", "name": "X", "market": "KRX",
            "sector": "X", "industry": "X",
        }
        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            client.post("/trade/buy", json={"ticker": "XSTOCK", "quantity": 2}, headers=auth_headers)

        # Try to sell 5
        with patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post("/trade/sell", json={"ticker": "XSTOCK", "quantity": 5}, headers=auth_headers)

        assert resp.status_code == 400
        assert "Not enough" in resp.json()["detail"]


class TestSessionScopedTrading:
    def test_explicit_session_buy_creates_scoped_holding_and_transaction(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/buy",
                json={"ticker": "KB", "quantity": 5},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        holding = db_session.query(Holding).filter_by(game_session_id=session.id, ticker="KB").one()
        transaction = db_session.query(Transaction).filter_by(game_session_id=session.id, ticker="KB").one()
        assert holding.quantity == 5
        assert transaction.transaction_type == "BUY"
        assert resp.json()["balance"]["krw"] == 995_000

    def test_explicit_session_sell_affects_only_selected_session(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session_a = create_game_session(db_session, user, cash_krw=1_000_000)
        session_b = create_game_session(db_session, user, cash_krw=2_000_000)
        create_session_holding(db_session, user, session_a, ticker="KB", quantity=5, avg_price=1000.0)
        create_session_holding(db_session, user, session_b, ticker="KB", quantity=7, avg_price=1000.0)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1200.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1200.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1200.0):
            resp = client.post(
                f"/game/sessions/{session_a.id}/trade/sell",
                json={"ticker": "KB", "quantity": 2},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        db_session.refresh(session_a)
        db_session.refresh(session_b)
        holding_a = db_session.query(Holding).filter_by(game_session_id=session_a.id, ticker="KB").one()
        holding_b = db_session.query(Holding).filter_by(game_session_id=session_b.id, ticker="KB").one()
        assert holding_a.quantity == 3
        assert holding_b.quantity == 7
        assert session_a.cash_krw == 1_002_400
        assert session_b.cash_krw == 2_000_000

    def test_session_sell_does_not_require_stock_info_when_holding_exists(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)
        create_session_holding(db_session, user, session, ticker="KB", quantity=3, avg_price=1000.0)

        with patch("app.services.trading_service.get_stock_info", return_value=None), \
             patch("app.services.trading_service.get_stock_price", return_value=1200.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1200.0):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/sell",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert resp.json()["transaction"]["name"] == "Test KRW"
        assert resp.json()["transaction"]["currency"] == "KRW"

    def test_session_sell_rejects_duplicate_same_ticker_holdings_across_markets(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)
        create_session_holding(db_session, user, session, ticker="DUP", market="KRX", quantity=2)
        create_session_holding(db_session, user, session, ticker="DUP", market="US", currency="USD", quantity=2)

        with patch("app.services.trading_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/sell",
                json={"ticker": "DUP", "quantity": 1},
                headers=auth_headers,
            )

        assert resp.status_code == 400
        assert "Multiple holdings found" in resp.json()["detail"]
        assert "market is required" in resp.json()["detail"]

    def test_buying_same_ticker_in_two_sessions_isolates_holdings(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session_a = create_game_session(db_session, user, cash_krw=1_000_000)
        session_b = create_game_session(db_session, user, cash_krw=1_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp_a = client.post(
                f"/game/sessions/{session_a.id}/trade/buy",
                json={"ticker": "KB", "quantity": 2},
                headers=auth_headers,
            )
            resp_b = client.post(
                f"/game/sessions/{session_b.id}/trade/buy",
                json={"ticker": "KB", "quantity": 4},
                headers=auth_headers,
            )

        assert resp_a.status_code == 200
        assert resp_b.status_code == 200
        holdings = db_session.query(Holding).filter(Holding.ticker == "KB").all()
        assert sorted((h.game_session_id, h.quantity) for h in holdings) == [
            (session_a.id, 2),
            (session_b.id, 4),
        ]

    def test_selected_session_cash_changes_and_user_balance_mirrors(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session_a = create_game_session(db_session, user, cash_krw=1_000_000)
        session_b = create_game_session(db_session, user, cash_krw=2_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                f"/game/sessions/{session_a.id}/trade/buy",
                json={"ticker": "KB", "quantity": 3},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        db_session.refresh(user)
        db_session.refresh(session_a)
        db_session.refresh(session_b)
        assert session_a.cash_krw == 997_000
        assert session_b.cash_krw == 2_000_000
        assert user.balance_krw == session_a.cash_krw

    def test_non_tradeable_sessions_reject_buy_sell_exchange(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        completed = create_game_session(db_session, user, status="completed", is_active=False)
        archived = create_game_session(db_session, user, status="archived", is_active=False)
        expired = create_game_session(
            db_session,
            user,
            status="active",
            end_date=datetime.now(timezone.utc) - timedelta(days=1),
        )
        create_session_holding(db_session, user, archived, ticker="KB", quantity=1)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0):
            buy_resp = client.post(
                f"/game/sessions/{completed.id}/trade/buy",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )
            sell_resp = client.post(
                f"/game/sessions/{archived.id}/trade/sell",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )
        exchange_resp = client.post(
            f"/game/sessions/{expired.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 1000},
            headers=auth_headers,
        )
        archived_exchange_resp = client.post(
            f"/game/sessions/{archived.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 1000},
            headers=auth_headers,
        )

        assert buy_resp.status_code == 400
        assert sell_resp.status_code == 400
        assert exchange_resp.status_code == 400
        assert archived_exchange_resp.status_code == 400

    def test_cross_user_session_trade_returns_404(self, client, db_session, registered_user, auth_headers):
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000, balance_usd=0)
        db_session.add(other)
        db_session.flush()
        other_session = create_game_session(db_session, other, cash_krw=1_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)):
            resp = client.post(
                f"/game/sessions/{other_session.id}/trade/buy",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )

        assert resp.status_code == 404

    def test_old_compatibility_buy_uses_current_session_when_available(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                "/trade/buy",
                json={"ticker": "KB", "quantity": 2},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        holding = db_session.query(Holding).filter_by(game_session_id=session.id, ticker="KB").one()
        assert holding.quantity == 2
        assert resp.json()["session_id"] == session.id

    def test_session_buy_writes_snapshot_with_game_session_id(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/buy",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        snapshot = db_session.query(PortfolioSnapshot).filter_by(game_session_id=session.id).one()
        assert snapshot.game_session_id == session.id

    def test_session_buy_returns_success_when_snapshot_capture_fails(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.take_session_snapshot", side_effect=RuntimeError("snapshot failed")):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/buy",
                json={"ticker": "KB", "quantity": 2},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "success"
        db_session.refresh(session)
        holding = db_session.query(Holding).filter_by(game_session_id=session.id, ticker="KB").one()
        transaction = db_session.query(Transaction).filter_by(game_session_id=session.id, ticker="KB").one()
        assert session.cash_krw == 998_000
        assert holding.quantity == 2
        assert transaction.transaction_type == "BUY"

    def test_session_sell_writes_snapshot_with_game_session_id(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)
        create_session_holding(db_session, user, session, ticker="KB", quantity=2, avg_price=1000.0)

        with patch("app.services.trading_service.get_stock_info", return_value=None), \
             patch("app.services.trading_service.get_stock_price", return_value=1200.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1200.0):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/sell",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        snapshot = db_session.query(PortfolioSnapshot).filter_by(game_session_id=session.id).one()
        assert snapshot.game_session_id == session.id

    def test_exchange_affects_only_selected_session_cash(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session_a = create_game_session(db_session, user, cash_krw=1_300_000, cash_usd=0)
        session_b = create_game_session(db_session, user, cash_krw=2_000_000, cash_usd=0)

        resp = client.post(
            f"/game/sessions/{session_a.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 130_000},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        db_session.refresh(session_a)
        db_session.refresh(session_b)
        assert session_a.cash_krw == 1_170_000
        assert session_a.cash_usd == 100
        assert session_b.cash_krw == 2_000_000
        tx = db_session.query(Transaction).filter_by(game_session_id=session_a.id, transaction_type="EXCHANGE").one()
        assert tx.ticker == "KRW/USD"
        assert tx.user_id == user.id
        assert tx.name == "Currency Exchange"
        assert tx.market == "FX"
        assert tx.quantity == 1
        assert tx.price == 1300.0
        assert tx.currency == "KRW"
        assert tx.total_amount == 130_000

    def test_exchange_initializes_nullable_legacy_usd_cash(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        user.balance_usd = None
        session = create_game_session(db_session, user, cash_krw=1_300_000, cash_usd=None)

        resp = client.post(
            f"/game/sessions/{session.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 130_000},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        db_session.refresh(session)
        db_session.refresh(user)
        assert session.cash_krw == 1_170_000
        assert session.cash_usd == 100
        assert user.balance_krw == 1_170_000
        assert user.balance_usd == 100

    def test_session_exchange_usd_to_krw_succeeds_with_enough_usd(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000, cash_usd=250)

        resp = client.post(
            f"/game/sessions/{session.id}/trade/exchange",
            json={"from_currency": "USD", "to_currency": "KRW", "amount": 100},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        db_session.refresh(session)
        body = resp.json()
        assert session.cash_usd == 150
        assert session.cash_krw == 1_130_000
        assert body["exchange"]["converted"] == 130_000
        assert body["balance"] == {"krw": 1_130_000, "usd": 150}

    def test_session_exchange_writes_snapshot_with_game_session_id(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_300_000, cash_usd=0)

        resp = client.post(
            f"/game/sessions/{session.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 130_000},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        snapshot = db_session.query(PortfolioSnapshot).filter_by(game_session_id=session.id).one()
        assert snapshot.game_session_id == session.id

    def test_session_exchange_returns_success_when_snapshot_capture_fails(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_300_000, cash_usd=0)

        with patch("app.services.trading_service.take_session_snapshot", side_effect=RuntimeError("snapshot failed")):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/exchange",
                json={"from_currency": "KRW", "to_currency": "USD", "amount": 130_000},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "success"
        db_session.refresh(session)
        tx = db_session.query(Transaction).filter_by(game_session_id=session.id, transaction_type="EXCHANGE").one()
        assert session.cash_krw == 1_170_000
        assert session.cash_usd == 100
        assert tx.ticker == "KRW/USD"

    def test_session_exchange_insufficient_balance_returns_400(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=50_000, cash_usd=0)

        resp = client.post(
            f"/game/sessions/{session.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 100_000},
            headers=auth_headers,
        )

        assert resp.status_code == 400
        assert "Insufficient KRW" in resp.json()["detail"]

    def test_session_exchange_invalid_currency_returns_400(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_300_000, cash_usd=0)

        resp = client.post(
            f"/game/sessions/{session.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "EUR", "amount": 100_000},
            headers=auth_headers,
        )

        assert resp.status_code == 400
        assert "Only KRW and USD supported" in resp.json()["detail"]

    def test_session_exchange_bad_rate_returns_400(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_300_000, cash_usd=0)

        with patch("app.services.trading_service.get_exchange_rate", return_value=None):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/exchange",
                json={"from_currency": "KRW", "to_currency": "USD", "amount": 100_000},
                headers=auth_headers,
            )

        assert resp.status_code == 400
        assert "Could not fetch exchange rate" in resp.json()["detail"]

    def test_watchlist_remains_untouched_by_session_trade(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)
        db_session.add(Watchlist(user_id=user.id, ticker="KB", name="Test KRW", market="KRX"))
        db_session.flush()

        with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
             patch("app.services.trading_service.get_stock_price", return_value=1000.0), \
             patch("app.services.snapshot_service.get_stock_price", return_value=1000.0):
            resp = client.post(
                f"/game/sessions/{session.id}/trade/buy",
                json={"ticker": "KB", "quantity": 1},
                headers=auth_headers,
            )

        assert resp.status_code == 200
        assert db_session.query(Watchlist).filter_by(user_id=user.id).count() == 1

    def test_buy_sell_exchange_reject_non_positive_values(self, client, db_session, registered_user, auth_headers):
        user = current_user(db_session, registered_user)
        session = create_game_session(db_session, user, cash_krw=1_000_000)

        buy_resp = client.post(
            f"/game/sessions/{session.id}/trade/buy",
            json={"ticker": "KB", "quantity": 0},
            headers=auth_headers,
        )
        sell_resp = client.post(
            f"/game/sessions/{session.id}/trade/sell",
            json={"ticker": "KB", "quantity": -1},
            headers=auth_headers,
        )
        exchange_resp = client.post(
            f"/game/sessions/{session.id}/trade/exchange",
            json={"from_currency": "KRW", "to_currency": "USD", "amount": 0},
            headers=auth_headers,
        )

        assert buy_resp.status_code == 422
        assert sell_resp.status_code == 422
        assert exchange_resp.status_code == 422
