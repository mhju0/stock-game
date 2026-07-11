import logging

try:
    import yfinance as yf
except Exception:  # yfinance import must never abort app startup
    yf = None
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def get_benchmark_data(index: str, days: int = 90) -> list:
    ticker_map = {
        "SP500": "^GSPC",
        "KOSPI": "^KS11",
    }

    symbol = ticker_map.get(index.upper())
    if not symbol:
        return []

    try:
        ticker = yf.Ticker(symbol)
        # Anchor the window to `days` ago (the caller passes the game's
        # elapsed days) so the 0% baseline lines up with the game start
        # instead of a fixed lookback period.
        start = datetime.now() - timedelta(days=max(int(days), 2))
        data = ticker.history(start=start.strftime("%Y-%m-%d"))

        if data.empty:
            return []

        first_close = float(data["Close"].iloc[0])
        results = []
        for date, row in data.iterrows():
            close = float(row["Close"])
            change_pct = ((close - first_close) / first_close) * 100
            results.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": round(close, 2),
                "change_pct": round(change_pct, 2),
            })
        return results
    except Exception as e:
        logger.warning("Benchmark error for %s: %s", index, e)
        return []