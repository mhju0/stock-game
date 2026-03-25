import yfinance as yf
import time
import threading

US_CANDIDATES = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
    "LLY", "V", "JPM", "UNH", "XOM", "MA", "JNJ", "PG", "AVGO",
    "HD", "COST", "MRK", "ABBV", "CRM", "AMD", "NFLX", "KO",
    "PEP", "TMO", "ADBE", "WMT", "ORCL", "CSCO", "ACN", "IBM",
    "INTC", "QCOM", "TXN", "NOW", "UBER", "DIS", "BA",
]

KR_CANDIDATES = [
    "005930.KS", "000660.KS", "373220.KS", "207940.KS", "006400.KS",
    "005380.KS", "051910.KS", "000270.KS", "068270.KS", "035420.KS",
    "035720.KS", "005490.KS", "028260.KS", "012450.KS", "055550.KS",
    "105560.KS", "017670.KS", "032830.KS", "066570.KS", "003670.KS",
    "034020.KS", "030200.KS", "012330.KS", "259960.KS", "352820.KS",
    "036570.KS", "323410.KS", "009150.KS", "018260.KS", "033780.KS",
    "377300.KS", "086790.KS", "010130.KS", "096770.KS", "003550.KS",
]

US_NAMES = {
    "AAPL": "Apple Inc.", "MSFT": "Microsoft", "GOOGL": "Alphabet", "AMZN": "Amazon",
    "NVDA": "NVIDIA", "META": "Meta Platforms", "TSLA": "Tesla", "BRK-B": "Berkshire Hathaway",
    "LLY": "Eli Lilly", "V": "Visa", "JPM": "JPMorgan Chase", "UNH": "UnitedHealth",
    "XOM": "Exxon Mobil", "MA": "Mastercard", "JNJ": "Johnson & Johnson", "PG": "Procter & Gamble",
    "AVGO": "Broadcom", "HD": "Home Depot", "COST": "Costco", "MRK": "Merck",
    "ABBV": "AbbVie", "CRM": "Salesforce", "AMD": "AMD", "NFLX": "Netflix",
    "KO": "Coca-Cola", "PEP": "PepsiCo", "TMO": "Thermo Fisher", "ADBE": "Adobe",
    "WMT": "Walmart", "ORCL": "Oracle", "CSCO": "Cisco", "ACN": "Accenture",
    "IBM": "IBM", "INTC": "Intel", "QCOM": "Qualcomm", "TXN": "Texas Instruments",
    "NOW": "ServiceNow", "UBER": "Uber", "DIS": "Disney", "BA": "Boeing",
}

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
}

cache = {
    "US": {"data": [], "timestamp": 0},
    "KR": {"data": [], "timestamp": 0},
}


def fetch_top_30(market: str) -> list:
    """Batch-download prices for all candidates in 1 API call instead of 70+."""
    candidates = US_CANDIDATES if market == "US" else KR_CANDIDATES
    names = US_NAMES if market == "US" else KR_NAMES

    try:
        # Single batch download — massively faster than per-ticker calls
        data = yf.download(candidates, period="2d", group_by="ticker", threads=True, progress=False)
    except Exception as e:
        print(f"Batch download failed for {market}: {e}")
        return []

    if data.empty:
        return []

    stocks = []
    for rank, ticker in enumerate(candidates):
        try:
            # For single ticker, yf.download returns flat columns
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
                "ticker": ticker,
                "name": names.get(ticker, ticker),
                "price": round(current, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "market_cap": 0,  # Skip per-ticker .info calls for speed
                "currency": "KRW" if market == "KR" else "USD",
                "rank": rank,
            })
        except Exception:
            continue

    # Candidates are already ordered by market cap, so preserve that order
    stocks.sort(key=lambda x: x["rank"])
    return stocks[:30]


def refresh_cache(market: str):
    try:
        data = fetch_top_30(market)
        if data:
            cache[market]["data"] = data
            cache[market]["timestamp"] = time.time()
            print(f"Top 30 {market} cache refreshed: {len(data)} stocks")
    except Exception as e:
        print(f"Cache refresh error for {market}: {e}")


def get_top_30(market: str) -> list:
    twelve_hours = 12 * 3600
    if cache[market]["data"] and (time.time() - cache[market]["timestamp"] < twelve_hours):
        return cache[market]["data"]

    refresh_cache(market)
    return cache[market]["data"]


def schedule_refresh():
    for market in ("US", "KR"):
        refresh_cache(market)
