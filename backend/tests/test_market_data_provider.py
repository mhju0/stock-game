from datetime import datetime
from types import SimpleNamespace

import pandas as pd
import pytest

from app.services import benchmark_service, market_data_provider, market_service, stock_service


class FakeResponse:
    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error

    def json(self):
        if self.error:
            raise self.error
        return self.payload


class FakeTicker:
    def __init__(self, fake, symbol):
        self.fake = fake
        self.symbol = symbol

    @property
    def info(self):
        value = self.fake.info_by_symbol.get(self.symbol, {})
        if isinstance(value, Exception):
            raise value
        return value

    def history(self, **kwargs):
        self.fake.history_calls.append((self.symbol, kwargs))
        value = self.fake.history_by_symbol.get(self.symbol, pd.DataFrame())
        if isinstance(value, Exception):
            raise value
        return value


class FakeMarketDataProvider:
    """One test-only fake for Yahoo REST, Ticker, and batch download paths."""

    def __init__(self):
        self.info_by_symbol = {}
        self.history_by_symbol = {}
        self.history_calls = []
        self.download_result = pd.DataFrame()
        self.download_calls = []
        self.search_result = {"quotes": []}

    def Ticker(self, symbol):
        return FakeTicker(self, symbol)

    def download(self, tickers, **kwargs):
        self.download_calls.append((tickers, kwargs))
        if isinstance(self.download_result, Exception):
            raise self.download_result
        return self.download_result

    def get(self, *_args, **_kwargs):
        if isinstance(self.search_result, Exception):
            raise self.search_result
        return FakeResponse(self.search_result)


@pytest.fixture
def provider_fake(monkeypatch):
    fake = FakeMarketDataProvider()
    monkeypatch.setattr(market_data_provider, "yf", fake)
    monkeypatch.setattr(market_data_provider.requests, "get", fake.get)
    market_data_provider._price_cache.clear()
    market_data_provider._metadata_cache.clear()
    market_data_provider._exchange_rate_cache.update({"value": None, "timestamp": 0})
    for value in market_data_provider._market_cache.values():
        value.update({"data": {}, "timestamp": 0, "session_date": None})
    yield fake
    market_data_provider._price_cache.clear()
    market_data_provider._metadata_cache.clear()


def close_frame(*values):
    return pd.DataFrame({"Close": list(values)})


def batch_frame(rows_by_ticker):
    frames = {
        ticker: pd.DataFrame({"Close": closes})
        for ticker, closes in rows_by_ticker.items()
    }
    return pd.concat(frames, axis=1)


class TestSearchTransport:
    def test_timeout_returns_empty(self, provider_fake):
        provider_fake.search_result = TimeoutError("slow")

        assert market_data_provider.search_equities("Apple") == []

    def test_stock_search_keeps_local_results_when_provider_times_out(self, provider_fake):
        provider_fake.search_result = TimeoutError("slow")

        results = stock_service.search_stocks("Apple")

        assert any(result["ticker"] == "AAPL" and result["name"] == "Apple" for result in results)

    @pytest.mark.parametrize("payload", [{"quotes": []}, [], {"quotes": [None]}])
    def test_empty_or_malformed_payload_returns_empty(self, provider_fake, payload):
        provider_fake.search_result = payload

        assert market_data_provider.search_equities("Apple") == []

    def test_stock_search_keeps_existing_response_shape(self, provider_fake):
        provider_fake.search_result = {
            "quotes": [
                {
                    "quoteType": "EQUITY",
                    "symbol": "ZZZZ",
                    "shortname": "Zed Corp",
                    "exchange": "NMS",
                }
            ]
        }

        assert stock_service.search_stocks("ZZZZ") == [
            {
                "ticker": "ZZZZ",
                "name": "Zed Corp",
                "name_en": "Zed Corp",
                "name_ko": "Zed Corp",
                "exchange": "NMS",
                "type": "EQUITY",
            }
        ]


class TestLatestPrice:
    def test_valid_close_is_rounded_and_cached(self, provider_fake):
        provider_fake.history_by_symbol["AAPL"] = close_frame(123.456)

        assert market_data_provider.get_stock_price("AAPL") == 123.46
        assert market_data_provider.get_stock_price("AAPL") == 123.46
        assert len(provider_fake.history_calls) == 1

    def test_timeout_uses_stale_cache(self, provider_fake, monkeypatch):
        market_data_provider._price_cache["AAPL"] = {"value": 111.0, "ts": 0}
        monkeypatch.setattr(market_data_provider.time, "time", lambda: 1_000)
        provider_fake.history_by_symbol["AAPL"] = TimeoutError("slow")

        assert market_data_provider.get_stock_price("AAPL") == 111.0

    @pytest.mark.parametrize(
        "frame",
        [pd.DataFrame(), pd.DataFrame({"Close": [None]}), close_frame(float("nan")), close_frame(0)],
    )
    def test_empty_or_invalid_close_returns_none(self, provider_fake, frame):
        provider_fake.history_by_symbol["AAPL"] = frame

        assert market_data_provider.get_stock_price("AAPL") is None

    def test_malformed_frame_returns_none_without_cache(self, provider_fake):
        provider_fake.history_by_symbol["AAPL"] = pd.DataFrame({"Open": [1.0]})

        assert market_data_provider.get_stock_price("AAPL") is None


class TestTickerMetadata:
    def test_valid_metadata_is_cached(self, provider_fake):
        provider_fake.info_by_symbol["AAPL"] = {"shortName": "Apple Inc.", "sector": "Technology"}

        assert market_data_provider.get_ticker_metadata("AAPL") == {
            "shortName": "Apple Inc.",
            "sector": "Technology",
        }
        provider_fake.info_by_symbol["AAPL"] = TimeoutError("slow")
        assert market_data_provider.get_ticker_metadata("AAPL") == {
            "shortName": "Apple Inc.",
            "sector": "Technology",
        }

    @pytest.mark.parametrize("value", [TimeoutError("slow"), {}, [], "bad"])
    def test_timeout_empty_or_malformed_metadata_returns_none(self, provider_fake, value):
        provider_fake.info_by_symbol["AAPL"] = value

        assert market_data_provider.get_ticker_metadata("AAPL") is None


class TestMarketBatch:
    def test_success_returns_last_and_previous_close(self, provider_fake):
        provider_fake.download_result = batch_frame({"AAPL": [100.0, 110.0], "MSFT": [200.0]})

        assert market_data_provider.fetch_market_closes(["AAPL", "MSFT"]) == {
            "AAPL": (110.0, 100.0),
            "MSFT": (200.0, 200.0),
        }

    @pytest.mark.parametrize("result", [TimeoutError("slow"), pd.DataFrame(), {"bad": "shape"}])
    def test_timeout_empty_or_malformed_returns_empty(self, provider_fake, result):
        provider_fake.download_result = result

        assert market_data_provider.fetch_market_closes(["AAPL"]) == {}

    def test_failed_refresh_preserves_stale_cache(self, provider_fake, monkeypatch):
        monkeypatch.setattr(market_data_provider, "_session_date_if_open", lambda _market: None)
        monkeypatch.setattr(market_data_provider.time, "time", lambda: 100_000)
        market_data_provider._market_cache["US"].update(
            {"data": {"AAPL": (100.0, 90.0)}, "timestamp": 0, "session_date": None}
        )
        provider_fake.download_result = TimeoutError("slow")

        assert market_data_provider.get_market_closes("US", ["AAPL"]) == {
            "AAPL": (100.0, 90.0)
        }

    def test_market_service_preserves_rank_and_response_shape(self, provider_fake):
        provider_fake.download_result = batch_frame(
            {"MSFT": [200.0, 220.0], "AAPL": [100.0, 110.0]}
        )

        assert market_service.fetch_top_30("US") == [
            {
                "rank": 2,
                "ticker": "AAPL",
                "name": "Apple",
                "price": 110.0,
                "change": 10.0,
                "change_pct": 10.0,
                "currency": "USD",
            },
            {
                "rank": 4,
                "ticker": "MSFT",
                "name": "Microsoft",
                "price": 220.0,
                "change": 20.0,
                "change_pct": 10.0,
                "currency": "USD",
            },
        ]

    def test_new_market_session_forces_refresh_inside_ttl(self, provider_fake, monkeypatch):
        monkeypatch.setattr(market_data_provider.time, "time", lambda: 1_000)
        monkeypatch.setattr(market_data_provider, "_session_date_if_open", lambda _market: "2026-07-14")
        market_data_provider._market_cache["US"].update(
            {
                "data": {"AAPL": (100.0, 90.0)},
                "timestamp": 999,
                "session_date": "2026-07-13",
            }
        )
        provider_fake.download_result = close_frame(100.0, 110.0)

        assert market_data_provider.get_market_closes("US", ["AAPL"]) == {
            "AAPL": (110.0, 100.0)
        }
        assert len(provider_fake.download_calls) == 1


class TestBenchmarkHistory:
    def test_unsupported_index_does_not_call_provider(self, provider_fake):
        assert benchmark_service.get_benchmark_data("UNKNOWN", 30) == []
        assert provider_fake.history_calls == []

    def test_timeout_empty_or_malformed_returns_empty(self, provider_fake):
        for frame in (TimeoutError("slow"), pd.DataFrame(), pd.DataFrame({"Open": [1.0]})):
            provider_fake.history_by_symbol["^GSPC"] = frame
            assert benchmark_service.get_benchmark_data("SP500", 30) == []

    def test_success_preserves_baseline_and_rounding(self, provider_fake, monkeypatch):
        provider_fake.history_by_symbol["^GSPC"] = pd.DataFrame(
            {"Close": [100.0, 110.0]},
            index=pd.to_datetime(["2026-07-01", "2026-07-02"]),
        )
        monkeypatch.setattr(
            benchmark_service,
            "datetime",
            SimpleNamespace(now=lambda: datetime(2026, 7, 14)),
        )

        assert benchmark_service.get_benchmark_data("SP500", 30) == [
            {"date": "2026-07-01", "close": 100.0, "change_pct": 0.0},
            {"date": "2026-07-02", "close": 110.0, "change_pct": 10.0},
        ]


class TestExchangeRate:
    def test_timeout_empty_or_malformed_uses_default(self, provider_fake):
        for frame in (TimeoutError("slow"), pd.DataFrame(), pd.DataFrame({"Open": [1.0]})):
            provider_fake.history_by_symbol["KRW=X"] = frame
            market_data_provider._exchange_rate_cache.update({"value": None, "timestamp": 0})
            assert market_data_provider.get_exchange_rate() == 1350.0

    def test_valid_rate_is_cached(self, provider_fake):
        provider_fake.history_by_symbol["KRW=X"] = close_frame(1400.0)

        assert market_data_provider.get_exchange_rate() == 1400.0
        assert market_data_provider.get_exchange_rate() == 1400.0
        assert len(provider_fake.history_calls) == 1

    def test_timeout_uses_expired_stale_rate(self, provider_fake, monkeypatch):
        market_data_provider._exchange_rate_cache.update({"value": 1390.0, "timestamp": 0})
        monkeypatch.setattr(market_data_provider.time, "time", lambda: 10_000)
        provider_fake.history_by_symbol["KRW=X"] = TimeoutError("slow")

        assert market_data_provider.get_exchange_rate() == 1390.0

    @pytest.mark.parametrize("value", [float("nan"), 0.0, -1.0])
    def test_invalid_rate_uses_default_without_caching(self, provider_fake, value):
        provider_fake.history_by_symbol["KRW=X"] = close_frame(value)

        assert market_data_provider.get_exchange_rate() == 1350.0
        assert market_data_provider._exchange_rate_cache["value"] is None
