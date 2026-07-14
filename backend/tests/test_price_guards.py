"""
Price/exchange-rate integrity guards.

A NaN or non-positive close from yfinance must never reach money math: it can
silently NaN-out a balance (NaN comparisons are always False, so sufficiency
checks pass and `cash -= NaN` commits) or hand out free shares at price 0.
These tests drive the real get_stock_price / get_exchange_rate with a mocked
yfinance and assert the bad value is rejected.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import math
import pandas as pd
import pytest

from app.models import GameSession, User
from app.services import exchange_service, market_data_provider, stock_service
from app.services.trading_service import buy_stock


def _yf_with_close(value):
    """A fake yfinance module whose Ticker().history() returns one Close row."""
    ticker = MagicMock()
    ticker.info = {}  # falsy -> get_stock_info skips the name branch, hits fallback
    ticker.history.return_value = pd.DataFrame({"Close": [value]})
    fake = MagicMock()
    fake.Ticker.return_value = ticker
    return fake


def _make_user_with_active_session(db_session, cash_usd=1_000_000.0):
    user = User(username="guard-user", hashed_password="hash",
                balance_krw=1_000_000.0, balance_usd=cash_usd)
    db_session.add(user)
    db_session.flush()
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id, title="S", status="active",
        starting_balance_krw=1_000_000.0, starting_balance_usd=cash_usd,
        cash_krw=1_000_000.0, cash_usd=cash_usd, duration_days=90,
        start_date=now - timedelta(days=1), end_date=now + timedelta(days=90),
        is_active=True,
    )
    db_session.add(session)
    db_session.flush()
    return user, session


class TestGetStockPriceGuard:
    def test_nan_close_returns_none(self):
        stock_service._price_cache.clear()
        with patch.object(market_data_provider, "yf", _yf_with_close(float("nan"))):
            assert stock_service.get_stock_price("AAPL") is None

    def test_zero_close_returns_none(self):
        stock_service._price_cache.clear()
        with patch.object(market_data_provider, "yf", _yf_with_close(0.0)):
            assert stock_service.get_stock_price("AAPL") is None

    def test_negative_close_returns_none(self):
        stock_service._price_cache.clear()
        with patch.object(market_data_provider, "yf", _yf_with_close(-5.0)):
            assert stock_service.get_stock_price("AAPL") is None

    def test_valid_close_still_returned(self):
        stock_service._price_cache.clear()
        with patch.object(market_data_provider, "yf", _yf_with_close(123.456)):
            assert stock_service.get_stock_price("AAPL") == 123.46


class TestGetExchangeRateGuard:
    def test_nan_rate_falls_back_and_is_not_cached(self):
        exchange_service.cached_rate = {"value": None, "timestamp": 0}
        with patch.object(market_data_provider, "yf", _yf_with_close(float("nan"))):
            rate = exchange_service.get_exchange_rate()
        assert rate == 1350.0
        assert not math.isnan(rate)
        # A NaN must never poison the cache for the rest of the process lifetime.
        assert exchange_service.cached_rate["value"] is None

    def test_valid_rate_cached(self):
        exchange_service.cached_rate = {"value": None, "timestamp": 0}
        with patch.object(market_data_provider, "yf", _yf_with_close(1400.0)):
            rate = exchange_service.get_exchange_rate()
        assert rate == 1400.0
        assert exchange_service.cached_rate["value"] == 1400.0


class TestBuyRejectsBadPrice:
    def test_buy_rejects_nan_price(self, db_session):
        stock_service._price_cache.clear()
        stock_service._info_cache.clear()
        market_data_provider._metadata_cache.clear()
        user, _ = _make_user_with_active_session(db_session)
        with patch.object(market_data_provider, "yf", _yf_with_close(float("nan"))):
            with pytest.raises(ValueError, match="Could not fetch"):
                buy_stock(db_session, user_id=user.id, ticker="AAPL", quantity=1)

    def test_buy_rejects_zero_price(self, db_session):
        stock_service._price_cache.clear()
        stock_service._info_cache.clear()
        market_data_provider._metadata_cache.clear()
        user, _ = _make_user_with_active_session(db_session)
        with patch.object(market_data_provider, "yf", _yf_with_close(0.0)):
            with pytest.raises(ValueError, match="Could not fetch"):
                buy_stock(db_session, user_id=user.id, ticker="AAPL", quantity=1)
