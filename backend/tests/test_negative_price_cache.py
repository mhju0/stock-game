"""A failed lookup must not cost an outbound call every single time.

The price and metadata caches only populated on success, so a client asking
repeatedly for symbols that do not resolve produced one upstream request per
request, forever. Caching the miss for a short window bounds that, and bounding
the cache stops the miss keys from growing without limit in exchange.
"""

import pandas as pd

from app.services import market_data_provider


def _fake_yf(calls, frame):
    class FakeTicker:
        def __init__(self, ticker):
            calls.append(ticker)

        def history(self, **kwargs):
            return frame

    return type("FakeYFinance", (), {"Ticker": FakeTicker})


def test_unresolvable_symbol_is_fetched_once(monkeypatch):
    calls = []
    monkeypatch.setattr(market_data_provider, "yf", _fake_yf(calls, pd.DataFrame()))
    market_data_provider._price_cache.clear()

    for _ in range(4):
        assert market_data_provider.get_stock_price("ZZZZ") is None

    assert len(calls) == 1


def test_negative_entries_expire_sooner_than_prices():
    assert (
        market_data_provider.NEGATIVE_CACHE_TTL
        < market_data_provider.PRICE_CACHE_TTL
    )


def test_price_cache_is_bounded(monkeypatch):
    calls = []
    monkeypatch.setattr(market_data_provider, "yf", _fake_yf(calls, pd.DataFrame()))
    market_data_provider._price_cache.clear()

    limit = market_data_provider.MAX_CACHE_KEYS
    for index in range(limit + 50):
        market_data_provider.get_stock_price(f"S{index}")

    assert len(market_data_provider._price_cache) <= limit


def test_a_real_price_is_still_cached_and_returned(monkeypatch):
    calls = []
    frame = pd.DataFrame(
        [{"Open": 1.0, "High": 1.0, "Low": 1.0, "Close": 12.5, "Volume": 1}],
        index=pd.to_datetime(["2026-07-09"]),
    )
    monkeypatch.setattr(market_data_provider, "yf", _fake_yf(calls, frame))
    market_data_provider._price_cache.clear()

    assert market_data_provider.get_stock_price("AAPL") == 12.5
    assert market_data_provider.get_stock_price("AAPL") == 12.5
    assert len(calls) == 1
