"""Concrete Yahoo market-data boundary.

This module is the only backend location that knows about yfinance, Yahoo's
search HTTP endpoint, or pandas response shapes.  Callers receive normalized
Python values and keep product-specific naming and calculations outside this
boundary.
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, time as dt_time
from typing import Any
from zoneinfo import ZoneInfo

import requests

try:
    import yfinance as yf
except Exception:  # yfinance import must never abort app startup
    yf = None


logger = logging.getLogger(__name__)

PRICE_CACHE_TTL = 300
METADATA_CACHE_TTL = 600
EXCHANGE_RATE_CACHE_TTL = 3600
MARKET_CACHE_TTL = 12 * 3600
DEFAULT_EXCHANGE_RATE = 1350.0

_price_cache: dict[str, dict[str, Any]] = {}
_metadata_cache: dict[str, dict[str, Any]] = {}
_exchange_rate_cache: dict[str, Any] = {"value": None, "timestamp": 0}
_market_cache: dict[str, dict[str, Any]] = {
    "US": {"data": {}, "timestamp": 0, "session_date": None},
    "KR": {"data": {}, "timestamp": 0, "session_date": None},
}

_yf_semaphore = threading.Semaphore(4)

MARKET_OPEN_CONFIG = {
    "US": {"tz": ZoneInfo("America/New_York"), "open": dt_time(9, 30)},
    "KR": {"tz": ZoneInfo("Asia/Seoul"), "open": dt_time(9, 0)},
}


def search_equities(query: str) -> list[dict]:
    """Return raw equity matches from Yahoo's search endpoint."""
    try:
        response = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": query, "quotesCount": 10, "newsCount": 0, "listsCount": 0},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        payload = response.json()
        if not isinstance(payload, dict):
            return []
        quotes = payload.get("quotes", [])
        if not isinstance(quotes, list):
            return []
        return [quote for quote in quotes if isinstance(quote, dict)]
    except Exception:
        return []


def get_stock_price(ticker: str) -> float | None:
    """Return a cached latest close, preserving the existing stale fallback."""
    now = time.time()
    cached = _price_cache.get(ticker)
    if cached and now - cached["ts"] < PRICE_CACHE_TTL:
        return cached["value"]

    try:
        stock = yf.Ticker(ticker)
        data = stock.history(period="1d")
        if data.empty:
            return None
        closes = data["Close"].dropna()
        if closes.empty:
            return None
        price = round(float(closes.iloc[-1]), 2)
        if price != price or price <= 0:
            return None
        _price_cache[ticker] = {"value": price, "ts": now}
        return price
    except Exception:
        if cached:
            return cached["value"]
        return None


def get_ticker_metadata(ticker: str) -> dict | None:
    """Return cached Yahoo metadata without leaking a yfinance Ticker."""
    now = time.time()
    cached = _metadata_cache.get(ticker)
    if cached and now - cached["ts"] < METADATA_CACHE_TTL:
        return cached["value"].copy()

    try:
        info = yf.Ticker(ticker).info
        if isinstance(info, dict) and info:
            value = info.copy()
            _metadata_cache[ticker] = {"value": value, "ts": now}
            return value.copy()
    except Exception:
        pass

    if cached:
        return cached["value"].copy()
    return None


def get_stock_history(ticker: str, period: str = "1mo") -> list[dict]:
    """Return normalized OHLCV rows for the stock chart endpoint."""
    valid_periods = {"1d": "1d", "1w": "5d", "1mo": "1mo", "3mo": "3mo", "1y": "1y"}
    yf_period = valid_periods.get(period, "1mo")
    try:
        history_kwargs = {"period": yf_period}
        if period == "1d":
            history_kwargs["interval"] = "5m"
        data = yf.Ticker(ticker).history(**history_kwargs)
        if data.empty:
            return []

        result = []
        for date, row in data.iterrows():
            timestamp = date.to_pydatetime() if hasattr(date, "to_pydatetime") else date
            result.append(
                {
                    "date": (
                        timestamp.isoformat(timespec="seconds")
                        if period == "1d"
                        else date.strftime("%Y-%m-%d")
                    ),
                    "open": round(float(row["Open"]), 2),
                    "high": round(float(row["High"]), 2),
                    "low": round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]),
                }
            )
        return result
    except Exception:
        return []


def get_exchange_rate() -> float:
    """Return cached USD/KRW, falling back to the last value or 1350."""
    now = time.time()
    cached_value = _exchange_rate_cache["value"]
    if cached_value and now - _exchange_rate_cache["timestamp"] < EXCHANGE_RATE_CACHE_TTL:
        return cached_value

    try:
        data = yf.Ticker("KRW=X").history(period="1d")
        if data.empty:
            return cached_value or DEFAULT_EXCHANGE_RATE
        closes = data["Close"].dropna()
        if closes.empty:
            return cached_value or DEFAULT_EXCHANGE_RATE
        rate = round(float(closes.iloc[-1]), 2)
        if rate != rate or rate <= 0:
            return cached_value or DEFAULT_EXCHANGE_RATE
        _exchange_rate_cache.update({"value": rate, "timestamp": now})
        return rate
    except Exception:
        return cached_value or DEFAULT_EXCHANGE_RATE


def fetch_market_closes(candidates: list[str]) -> dict[str, tuple[float, float]]:
    """Download and normalize current/previous closes for a market batch."""
    try:
        with _yf_semaphore:
            data = yf.download(
                candidates,
                period="2d",
                group_by="ticker",
                threads=4,
                progress=False,
            )
        if data.empty:
            return {}
    except Exception as exc:
        logger.warning("Batch market-data download failed: %s", exc)
        return {}

    result: dict[str, tuple[float, float]] = {}
    for ticker in candidates:
        try:
            if len(candidates) == 1:
                ticker_data = data
            else:
                if ticker not in data.columns.get_level_values(0):
                    continue
                ticker_data = data[ticker]

            closes = ticker_data["Close"].dropna()
            if closes.empty:
                continue
            current = float(closes.iloc[-1])
            previous = float(closes.iloc[-2]) if len(closes) >= 2 else current
            result[ticker] = (current, previous)
        except Exception as exc:
            logger.warning("Skipping malformed market data for %s: %s", ticker, exc)
    return result


def _is_trading_day(local_now: datetime) -> bool:
    return local_now.weekday() < 5


def _session_date_if_open(market: str) -> str | None:
    cfg = MARKET_OPEN_CONFIG[market]
    local_now = datetime.now(cfg["tz"])
    if not _is_trading_day(local_now):
        return None
    market_open = local_now.replace(
        hour=cfg["open"].hour,
        minute=cfg["open"].minute,
        second=0,
        microsecond=0,
    )
    if local_now >= market_open:
        return local_now.date().isoformat()
    return None


def refresh_market_closes(market: str, candidates: list[str]) -> dict[str, tuple[float, float]]:
    data = fetch_market_closes(candidates)
    if data:
        _market_cache[market].update(
            {
                "data": data,
                "timestamp": time.time(),
                "session_date": _session_date_if_open(market),
            }
        )
    return data


def get_market_closes(market: str, candidates: list[str]) -> dict[str, tuple[float, float]]:
    cached = _market_cache[market]
    session_date = _session_date_if_open(market)
    session_needs_refresh = session_date is not None and cached.get("session_date") != session_date
    if (
        cached["data"]
        and time.time() - cached["timestamp"] < MARKET_CACHE_TTL
        and not session_needs_refresh
    ):
        return cached["data"]
    refresh_market_closes(market, candidates)
    return cached["data"]


def get_close_history(symbol: str, start: str) -> list[tuple[Any, float]]:
    """Return dated closes for benchmark calculations."""
    try:
        data = yf.Ticker(symbol).history(start=start)
        if data.empty:
            return []
        return [(date, float(row["Close"])) for date, row in data.iterrows()]
    except Exception:
        return []
