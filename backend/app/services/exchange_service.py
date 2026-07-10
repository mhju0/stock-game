try:
    import yfinance as yf
except Exception:  # yfinance import must never abort app startup
    yf = None
import time

cached_rate = {"value": None, "timestamp": 0}


def get_exchange_rate() -> float:
    now = time.time()
    if cached_rate["value"] and now - cached_rate["timestamp"] < 3600:
        return cached_rate["value"]

    try:
        ticker = yf.Ticker("KRW=X")
        data = ticker.history(period="1d")
        if data.empty:
            return cached_rate["value"] or 1350.0

        closes = data["Close"].dropna()
        if closes.empty:
            return cached_rate["value"] or 1350.0

        rate = round(float(closes.iloc[-1]), 2)
        # Never cache a NaN/invalid rate: a truthy NaN in the cache would poison
        # every conversion for the rest of the process lifetime.
        if rate != rate or rate <= 0:
            return cached_rate["value"] or 1350.0

        cached_rate["value"] = rate
        cached_rate["timestamp"] = now
        return rate
    except Exception:
        return cached_rate["value"] or 1350.0