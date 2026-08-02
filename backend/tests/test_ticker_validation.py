"""Ticker symbols must match a symbol shape before they leave the process.

yfinance interpolates the symbol into a Yahoo API URL, and the public
/stock/* routes are unauthenticated, so an arbitrary string reaches an
outbound request builder with no format check at all.

Search is deliberately excluded: it takes free text (Korean company names),
not symbols, and pattern-gating it would break the primary lookup flow.
"""

import pandas as pd
import pytest
from pydantic import ValidationError

from app.schemas import BuyRequest, SellRequest
from app.services import market_data_provider

# Malformed values that survive URL path normalisation unchanged.
ROUTE_MALFORMED = ["A" * 13, "AA PL", "AAPL$", "AAPL*"]
SCHEMA_MALFORMED = ROUTE_MALFORMED + ["../../etc/passwd", "AAPL/../x", ""]
WELL_FORMED = ["AAPL", "005930.KS", "BRK-B", "A"]


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


@pytest.mark.parametrize("ticker", ROUTE_MALFORMED)
def test_stock_info_route_rejects_malformed_ticker(client, ticker):
    """Rejected before the handler runs, so no outbound call is ever built."""
    assert client.get(f"/stock/{ticker}").status_code == 422


@pytest.mark.parametrize("ticker", ROUTE_MALFORMED)
def test_stock_history_route_rejects_malformed_ticker(client, ticker):
    assert client.get(f"/stock/{ticker}/history").status_code == 422


@pytest.mark.parametrize("ticker", ROUTE_MALFORMED)
def test_watchlist_add_rejects_malformed_ticker(client, auth_headers, ticker):
    resp = client.post(f"/watchlist/add?ticker={ticker}", headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.parametrize("ticker", SCHEMA_MALFORMED)
def test_trade_schemas_reject_malformed_ticker(ticker):
    with pytest.raises(ValidationError):
        BuyRequest(ticker=ticker, quantity=1)
    with pytest.raises(ValidationError):
        SellRequest(ticker=ticker, quantity=1)


@pytest.mark.parametrize("ticker", WELL_FORMED)
def test_well_formed_tickers_still_accepted(ticker):
    assert BuyRequest(ticker=ticker, quantity=1).ticker == ticker
    assert SellRequest(ticker=ticker, quantity=1).ticker == ticker


def test_history_route_still_serves_a_korean_symbol(client, monkeypatch):
    monkeypatch.setattr(market_data_provider, "yf", FakeYFinance)
    assert client.get("/stock/005930.KS/history?period=1mo").status_code == 200


def test_search_still_accepts_free_text(client, monkeypatch):
    """Search takes company names, not symbols, and must stay ungated."""
    monkeypatch.setattr(market_data_provider, "search_equities", lambda query: [])
    assert client.get("/stock/search/삼성전자").status_code == 200
