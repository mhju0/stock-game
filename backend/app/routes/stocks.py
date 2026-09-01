from fastapi import APIRouter, Depends
from app.schemas import TickerPath
from app.services.public_rate_limit import enforce_market_data_rate_limit
from app.services.stock_service import get_stock_history, get_stock_info, search_stocks
from app.services.exchange_service import get_exchange_rate
from app.services.market_service import get_top_30

# Every route here is unauthenticated and reaches an upstream provider, so the
# throttle is applied to the whole router rather than remembered per route.
router = APIRouter(
    tags=["stocks"],
    dependencies=[Depends(enforce_market_data_rate_limit)],
)


# IMPORTANT: /stock/search must come BEFORE /stock/{ticker}
# otherwise FastAPI matches "search" as a ticker
@router.get("/stock/search/{query}")
def stock_search(query: str):
    return search_stocks(query)


@router.get("/stock/{ticker}/history")
def stock_history(ticker: TickerPath, period: str = "1mo"):
    return get_stock_history(ticker, period)


@router.get("/stock/{ticker}")
def stock_info_endpoint(ticker: TickerPath):
    info = get_stock_info(ticker)
    if not info:
        return {"error": "Stock not found"}
    return info


@router.get("/exchange-rate")
def exchange_rate():
    return {"usd_to_krw": get_exchange_rate()}


@router.get("/market/top30/{market}")
def top_30(market: str):
    """Return quoted symbols from the point-in-time large-cap discovery set.

    The route name is retained for client compatibility; it is not a live
    market-cap ranking.
    """
    if market.upper() not in ("US", "KR"):
        return {"error": "Market must be US or KR"}
    return get_top_30(market.upper())
