import yfinance as yf
import time
import threading
from datetime import datetime, time as dt_time
from zoneinfo import ZoneInfo
from app.services.stock_service import US_STOCK_NAMES_EN, KR_STOCK_NAMES_EN

# ── Static ranking by market cap (updated periodically) ─────────
# These are pre-sorted by approximate market cap, largest first.
# The rank order is what matters, not the exact cap number.
# Update this list every few months if major changes happen.

US_TOP_50 = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "BRK-B", "TSLA",
    "AVGO", "LLY", "JPM", "V", "UNH", "MA", "XOM", "COST",
    "HD", "PG", "JNJ", "NFLX", "ABBV", "CRM", "ORCL", "MRK",
    "AMD", "KO", "PEP", "ADBE", "WMT", "TMO", "CSCO", "ACN",
    "IBM", "NOW", "TXN", "QCOM", "INTC", "UBER", "DIS", "BA",
    "ISRG", "AMGN", "GS", "MS", "BLK", "SPGI", "AXP", "SBUX",
    "CVX", "NEE",
]

KR_TOP_50 = [
    "005930.KS", "000660.KS", "373220.KS", "005380.KS", "207940.KS",
    "006400.KS", "035420.KS", "000270.KS", "012450.KS", "068270.KS",
    "051910.KS", "105560.KS", "055550.KS", "035720.KS", "005490.KS",
    "032830.KS", "028260.KS", "138040.KS", "000810.KS", "086790.KS",
    "042660.KS", "009540.KS", "329180.KS", "034730.KS", "096770.KS",
    "259960.KS", "012330.KS", "009150.KS", "018260.KS", "352820.KS",
    "323410.KS", "066570.KS", "003550.KS", "316140.KS", "015760.KS",
    "010130.KS", "042700.KS", "034020.KS", "033780.KS", "011070.KS",
    "003670.KS", "247540.KS", "086520.KS", "017670.KS", "030200.KS",
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

cache = {
    "US": {"data": [], "timestamp": 0, "session_date": None},
    "KR": {"data": [], "timestamp": 0, "session_date": None},
}

MARKET_OPEN_CONFIG = {
    "US": {"tz": ZoneInfo("America/New_York"), "open": dt_time(9, 30)},
    "KR": {"tz": ZoneInfo("Asia/Seoul"), "open": dt_time(9, 0)},
}


def _is_trading_day(local_now: datetime) -> bool:
    return local_now.weekday() < 5


def _session_date_if_open(market: str) -> str | None:
    cfg = MARKET_OPEN_CONFIG[market]
    local_now = datetime.now(cfg["tz"])
    if not _is_trading_day(local_now):
        return None
    market_open = local_now.replace(
        hour=cfg["open"].hour,
        minute=cfg["open"].minute,
        second=0,
        microsecond=0,
    )
    if local_now >= market_open:
        return local_now.date().isoformat()
    return None


def fetch_top_30(market: str) -> list:
    """Download prices in batch, rank by static market cap order."""
    candidates = US_TOP_50 if market == "US" else KR_TOP_50
    names = US_NAMES if market == "US" else KR_NAMES

    try:
        data = yf.download(
            candidates, period="2d", group_by="ticker",
            threads=True, progress=False,
        )
    except Exception as e:
        print(f"Batch download failed for {market}: {e}")
        return []

    if data.empty:
        return []

    stocks = []
    for rank, ticker in enumerate(candidates, start=1):
        try:
            if len(candidates) == 1:
                ticker_data = data
            else:
                if ticker not in data.columns.get_level_values(0):
                    continue
                ticker_data = data[ticker]

            closes = ticker_data["Close"].dropna()
            if closes.empty:
                continue

            current = float(closes.iloc[-1])
            prev = float(closes.iloc[-2]) if len(closes) >= 2 else current
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
        except Exception:
            continue

    # Already in rank order from the static list, just take top 30
    stocks.sort(key=lambda x: x["rank"])
    return stocks[:30]


def refresh_cache(market: str):
    try:
        data = fetch_top_30(market)
        if data:
            cache[market]["data"] = data
            cache[market]["timestamp"] = time.time()
            cache[market]["session_date"] = _session_date_if_open(market)
            print(f"Top 30 {market} cache refreshed: {len(data)} stocks")
    except Exception as e:
        print(f"Cache refresh error for {market}: {e}")


def get_top_30(market: str) -> list:
    twelve_hours = 12 * 3600
    session_date = _session_date_if_open(market)
    session_needs_refresh = (
        session_date is not None and cache[market].get("session_date") != session_date
    )

    if (
        cache[market]["data"]
        and (time.time() - cache[market]["timestamp"] < twelve_hours)
        and not session_needs_refresh
    ):
        return cache[market]["data"]

    refresh_cache(market)
    return cache[market]["data"]


def schedule_refresh():
    for market in ("US", "KR"):
        refresh_cache(market)
