import yfinance as yf
from fastapi import APIRouter
from app.services.stock_service import get_stock_info, search_stocks
from app.services.exchange_service import get_exchange_rate
from app.services.market_service import get_top_30

router = APIRouter(tags=["stocks"])


# IMPORTANT: /stock/search must come BEFORE /stock/{ticker}
# otherwise FastAPI matches "search" as a ticker
@router.get("/stock/search/{query}")
def stock_search(query: str):
    return search_stocks(query)


@router.get("/stock/{ticker}/history")
def stock_history(ticker: str, period: str = "1mo"):
    valid_periods = {"1d": "1d", "1w": "5d", "1mo": "1mo", "3mo": "3mo", "1y": "1y"}
    yf_period = valid_periods.get(period, "1mo")
    try:
        stock = yf.Ticker(ticker)
        data = stock.history(period=yf_period)
        if data.empty:
            return []
        result = []
        for date, row in data.iterrows():
            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })
        return result
    except Exception:
        return []


@router.get("/stock/{ticker}")
def stock_info_endpoint(ticker: str):
    info = get_stock_info(ticker)
    if not info:
        return {"error": "Stock not found"}
    return info


@router.get("/exchange-rate")
def exchange_rate():
    return {"usd_to_krw": get_exchange_rate()}


@router.get("/market/top30/{market}")
def top_30(market: str):
    if market.upper() not in ("US", "KR"):
        return {"error": "Market must be US or KR"}
    return get_top_30(market.upper())
