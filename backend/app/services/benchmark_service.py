import logging

from datetime import datetime, timedelta

from app.services import market_data_provider

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
        # Anchor the window to `days` ago (the caller passes the game's
        # elapsed days) so the 0% baseline lines up with the game start
        # instead of a fixed lookback period.
        start = datetime.now() - timedelta(days=max(int(days), 2))
        closes = market_data_provider.get_close_history(symbol, start.strftime("%Y-%m-%d"))
        if not closes:
            return []

        first_close = closes[0][1]
        results = []
        for date, close in closes:
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
