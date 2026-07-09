import pandas as pd


class FakeTicker:
    calls = []

    def __init__(self, ticker):
        self.ticker = ticker

    def history(self, **kwargs):
        self.calls.append(kwargs)
        return pd.DataFrame(
            [
                {"Open": 100.0, "High": 101.0, "Low": 99.0, "Close": 100.5, "Volume": 1000},
                {"Open": 100.5, "High": 102.0, "Low": 100.0, "Close": 101.5, "Volume": 1200},
            ],
            index=pd.to_datetime(["2026-07-09 09:30", "2026-07-09 09:35"]),
        )


class FakeYFinance:
    Ticker = FakeTicker


def test_one_day_history_requests_intraday_interval(client, monkeypatch):
    FakeTicker.calls = []
    monkeypatch.setattr("app.routes.stocks.yf", FakeYFinance)

    resp = client.get("/stock/AAPL/history?period=1d")

    assert resp.status_code == 200
    assert FakeTicker.calls == [{"period": "1d", "interval": "5m"}]
    data = resp.json()
    assert len(data) == 2
    assert data[0]["date"] == "2026-07-09T09:30:00"


def test_non_intraday_history_uses_daily_period_without_interval(client, monkeypatch):
    FakeTicker.calls = []
    monkeypatch.setattr("app.routes.stocks.yf", FakeYFinance)

    resp = client.get("/stock/AAPL/history?period=1mo")

    assert resp.status_code == 200
    assert FakeTicker.calls == [{"period": "1mo"}]
    data = resp.json()
    assert len(data) == 2
    assert data[0]["date"] == "2026-07-09"
