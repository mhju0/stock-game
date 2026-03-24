import yfinance as yf
import time

cached_rate = {"value": None, "timestamp": 0}


def get_exchange_rate() -> float:
    now = time.time()
    if cached_rate["value"] and now - cached_rate["timestamp"] < 3600:
        return cached_rate["value"]

    ticker = yf.Ticker("KRW=X")
    data = ticker.history(period="1d")
    if data.empty:
        return cached_rate["value"] or 1350.0

    rate = round(data["Close"].iloc[-1], 2)
    cached_rate["value"] = rate
    cached_rate["timestamp"] = now
    return rate