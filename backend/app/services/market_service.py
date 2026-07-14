import gc
import logging
import time

from app.services import market_data_provider
from app.services.stock_service import US_STOCK_NAMES_EN, KR_STOCK_NAMES_EN

logger = logging.getLogger(__name__)

# ── Static ranking by market cap (updated periodically) ─────────
# These are pre-sorted by approximate market cap, largest first.
# The rank order is what matters, not the exact cap number.
# Update this list every few months if major changes happen.

US_TOP_50 = [
    # Verified March 24, 2026 — finhacker.cz/largest-us-companies-by-market-cap
    "NVDA", "AAPL", "GOOGL", "MSFT", "AMZN", "AVGO", "META", "TSLA",
    "BRK-B", "WMT", "LLY", "JPM", "XOM", "V", "JNJ", "MU",
    "MA", "COST", "ORCL", "CVX", "NFLX", "PLTR", "ABBV", "AMD",
    "CAT", "PG", "HD", "KO", "CSCO", "GE", "LRCX", "AMAT",
    "MRK", "MS", "RTX", "GS", "UNH", "IBM", "INTC", "VZ",
    "AXP", "PEP", "KLAC", "T", "NEE", "AMGN", "TMO", "TXN",
    "GILD", "DIS",
]

KR_TOP_50 = [
    # Verified March 2026 — companiesmarketcap.com, disfold.com
    "005930.KS", "000660.KS", "207940.KS", "005380.KS", "000270.KS",
    "012450.KS", "105560.KS", "055550.KS", "006400.KS", "267260.KS",
    "068270.KS", "035420.KS", "138040.KS", "086790.KS", "015760.KS",
    "005490.KS", "042700.KS", "051910.KS", "035720.KS", "316140.KS",
    "032830.KS", "000810.KS", "028260.KS", "066570.KS", "009540.KS",
    "042660.KS", "329180.KS", "012330.KS", "259960.KS", "352820.KS",
    "373220.KS", "034730.KS", "096770.KS", "010130.KS", "009150.KS",
    "018260.KS", "323410.KS", "003550.KS", "034020.KS", "033780.KS",
    "011070.KS", "003670.KS", "017670.KS", "030200.KS", "247540.KS",
    "003490.KS", "377300.KS", "036570.KS", "097950.KS", "090430.KS",
]

# Use imported name dicts from stock_service (single source of truth)
US_NAMES = US_STOCK_NAMES_EN

KR_NAMES = {
    "005930.KS": "삼성전자", "000660.KS": "SK하이닉스", "373220.KS": "LG에너지솔루션",
    "207940.KS": "삼성바이오로직스", "006400.KS": "삼성SDI", "005380.KS": "현대자동차",
    "051910.KS": "LG화학", "000270.KS": "기아", "068270.KS": "셀트리온",
    "035420.KS": "네이버", "035720.KS": "카카오", "005490.KS": "포스코홀딩스",
    "028260.KS": "삼성물산", "012450.KS": "한화에어로스페이스", "055550.KS": "신한지주",
    "105560.KS": "KB금융", "017670.KS": "SK텔레콤", "032830.KS": "삼성생명",
    "066570.KS": "LG전자", "003670.KS": "포스코퓨처엠", "034020.KS": "두산에너빌리티",
    "030200.KS": "KT", "012330.KS": "현대모비스", "259960.KS": "크래프톤",
    "352820.KS": "하이브", "036570.KS": "엔씨소프트", "323410.KS": "카카오뱅크",
    "009150.KS": "삼성전기", "018260.KS": "삼성SDS", "033780.KS": "KT&G",
    "377300.KS": "카카오페이", "086790.KS": "하나금융지주", "010130.KS": "고려아연",
    "096770.KS": "SK이노베이션", "003550.KS": "LG",
    "042660.KS": "한화오션", "009540.KS": "HD한국조선해양",
    "329180.KS": "HD현대중공업", "034730.KS": "SK",
    "316140.KS": "우리금융지주", "015760.KS": "한국전력",
    "000810.KS": "삼성화재", "138040.KS": "메리츠금융지주",
    "097950.KS": "CJ제일제당", "090430.KS": "아모레퍼시픽",
    "247540.KS": "에코프로비엠", "086520.KS": "에코프로",
    "003490.KS": "대한항공", "011070.KS": "LG이노텍",
    "042700.KS": "한미반도체",
}

cache = market_data_provider._market_cache


def _market_inputs(market: str) -> tuple[list[str], dict[str, str]]:
    return (
        (US_TOP_50, US_NAMES)
        if market == "US"
        else (KR_TOP_50, KR_NAMES)
    )


def _format_top_30(
    market: str,
    closes_by_ticker: dict[str, tuple[float, float]],
) -> list:
    candidates, names = _market_inputs(market)
    stocks = []
    for rank, ticker in enumerate(candidates, start=1):
        try:
            if ticker not in closes_by_ticker:
                continue
            current, prev = closes_by_ticker[ticker]
            change = current - prev
            change_pct = (change / prev) * 100 if prev else 0
            stocks.append({
                "rank": rank,
                "ticker": ticker,
                "name": names.get(ticker, ticker),
                "price": round(current, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "currency": "KRW" if market == "KR" else "USD",
            })
        except Exception as exc:
            logger.warning("Skipping ticker %s: %s", ticker, exc)
    stocks.sort(key=lambda stock: stock["rank"])
    return stocks[:30]


def fetch_top_30(market: str) -> list:
    """Download prices in batch, rank by static market cap order."""
    candidates, _ = _market_inputs(market)
    return _format_top_30(market, market_data_provider.fetch_market_closes(candidates))


def refresh_cache(market: str):
    try:
        candidates, _ = _market_inputs(market)
        closes = market_data_provider.refresh_market_closes(market, candidates)
        if closes:
            logger.info("Top 30 %s cache refreshed: %d stocks", market, len(_format_top_30(market, closes)))
    except Exception as exc:
        logger.warning("Cache refresh error for %s: %s", market, exc)


def get_top_30(market: str) -> list:
    candidates, _ = _market_inputs(market)
    closes = market_data_provider.get_market_closes(market, candidates)
    return _format_top_30(market, closes)


def schedule_refresh():
    refresh_cache("US")
    time.sleep(2)
    refresh_cache("KR")
    # Sweep the pandas frames the batch downloads left behind. Background-only
    # (never on the request path) so it costs no request latency.
    gc.collect()
