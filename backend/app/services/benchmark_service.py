import yfinance as yf
from datetime import datetime, timedelta


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
        period = "1mo" if days <= 30 else "3mo" if days <= 90 else "1y"
        data = ticker.history(period=period)

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
        print(f"Benchmark error for {index}: {e}")
        return []