"""Watchlist routes reach the market-data provider too.

Adding an entry resolves the symbol upstream and listing the watchlist prices
every entry, so both are outbound-call paths. The throttle was applied to the
/stock/* router and the benchmark route but missed these.
"""

import pytest

from app.routes import watchlist as watchlist_routes

STOCK_INFO = {"name": "Test Corp", "market": "US", "currency": "USD", "price": 100.0}


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    monkeypatch.setattr(watchlist_routes, "get_stock_info", lambda ticker: STOCK_INFO)
    monkeypatch.setattr(
        watchlist_routes, "get_prices_for_tickers", lambda tickers: {t: 1.0 for t in tickers}
    )


def test_watchlist_add_is_throttled(client, auth_headers):
    from app.services.public_rate_limit import MARKET_DATA_LIMIT

    for index in range(MARKET_DATA_LIMIT):
        client.post(f"/watchlist/add?ticker=SYM{index}", headers=auth_headers)

    resp = client.post("/watchlist/add?ticker=LAST", headers=auth_headers)
    assert resp.status_code == 429


def test_watchlist_listing_is_throttled(client, auth_headers):
    from app.services.public_rate_limit import MARKET_DATA_LIMIT

    for _ in range(MARKET_DATA_LIMIT):
        client.get("/watchlist/", headers=auth_headers)

    assert client.get("/watchlist/", headers=auth_headers).status_code == 429


def test_removing_an_entry_is_not_throttled(client, auth_headers):
    """Deleting touches no upstream provider, so it must stay usable even when
    the market-data budget is spent."""
    from app.services.public_rate_limit import MARKET_DATA_LIMIT

    client.post("/watchlist/add?ticker=KEEPME", headers=auth_headers)
    for _ in range(MARKET_DATA_LIMIT + 5):
        client.get("/watchlist/", headers=auth_headers)

    assert client.delete("/watchlist/remove/KEEPME", headers=auth_headers).status_code == 200
