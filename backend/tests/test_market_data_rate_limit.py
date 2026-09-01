"""The public market-data routes proxy to Yahoo.

Some lookups have positive and negative caches, while search and history can
still reach upstream on every call. Unthrottled and unauthenticated, one client
can burn the deployment's upstream quota and take market data down for every
user.
"""

import pandas as pd

from app.services import market_data_provider

ATTACKER = {"X-Forwarded-For": "203.0.113.50"}
BYSTANDER = {"X-Forwarded-For": "198.51.100.22"}


class FakeTicker:
    def __init__(self, ticker):
        self.ticker = ticker

    def history(self, **kwargs):
        return pd.DataFrame(
            [{"Open": 1.0, "High": 1.0, "Low": 1.0, "Close": 1.0, "Volume": 1}],
            index=pd.to_datetime(["2026-07-09"]),
        )


class FakeYFinance:
    Ticker = FakeTicker


def test_market_data_is_capped_per_address(client, monkeypatch):
    from app.services.public_rate_limit import MARKET_DATA_LIMIT

    monkeypatch.setattr(market_data_provider, "yf", FakeYFinance)

    for _ in range(MARKET_DATA_LIMIT):
        assert client.get("/stock/AAPL/history", headers=ATTACKER).status_code == 200

    resp = client.get("/stock/AAPL/history", headers=ATTACKER)
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1


def test_one_address_does_not_throttle_another(client, monkeypatch):
    from app.services.public_rate_limit import MARKET_DATA_LIMIT

    monkeypatch.setattr(market_data_provider, "yf", FakeYFinance)

    for _ in range(MARKET_DATA_LIMIT + 5):
        client.get("/stock/AAPL/history", headers=ATTACKER)

    assert client.get("/stock/AAPL/history", headers=BYSTANDER).status_code == 200


def test_search_route_is_also_capped(client, monkeypatch):
    from app.services.public_rate_limit import MARKET_DATA_LIMIT

    monkeypatch.setattr(market_data_provider, "search_equities", lambda query: [])

    for index in range(MARKET_DATA_LIMIT):
        assert client.get(f"/stock/search/probe{index}", headers=ATTACKER).status_code == 200

    assert client.get("/stock/search/probe", headers=ATTACKER).status_code == 429
