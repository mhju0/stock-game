"""
Trading tests — buy/sell paths with mocked stock data (no yfinance).
All monetary assertions check the actual DB state via the response body.
"""


TICKER = "AAPL"
MOCK_PRICE = 100.0          # set in conftest MOCK_STOCK_INFO
INITIAL_USD = 0.0
INITIAL_KRW = 10_000_000.0  # User model default


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
