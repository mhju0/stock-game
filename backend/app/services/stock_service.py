import yfinance as yf
import requests
import time

# ── Caches ──────────────────────────────────────────────────────────
# Price cache: 60-second TTL keeps pages fast without stale data
_price_cache: dict[str, dict] = {}
PRICE_CACHE_TTL = 60  # seconds

# Info cache: 10-minute TTL since sector/industry/name rarely change
_info_cache: dict[str, dict] = {}
INFO_CACHE_TTL = 600  # seconds

KOREAN_STOCKS = {
    "삼성전자": "005930.KS",
    "삼성": "005930.KS",
    "SK하이닉스": "000660.KS",
    "하이닉스": "000660.KS",
    "카카오": "035720.KS",
    "네이버": "035420.KS",
    "현대차": "005380.KS",
    "현대자동차": "005380.KS",
    "기아": "000270.KS",
    "셀트리온": "068270.KS",
    "LG에너지솔루션": "373220.KS",
    "LG화학": "051910.KS",
    "포스코홀딩스": "005490.KS",
    "삼성바이오로직스": "207940.KS",
    "삼성SDI": "006400.KS",
    "카카오뱅크": "323410.KS",
    "카카오페이": "377300.KS",
    "크래프톤": "259960.KS",
    "하이브": "352820.KS",
    "엔씨소프트": "036570.KS",
    "삼성물산": "028260.KS",
    "한화에어로스페이스": "012450.KS",
    "두산에너빌리티": "034020.KS",
    "현대모비스": "012330.KS",
    "KB금융": "105560.KS",
    "신한지주": "055550.KS",
    "삼성생명": "032830.KS",
    "LG전자": "066570.KS",
    "SK텔레콤": "017670.KS",
    "KT": "030200.KS",
}

US_STOCK_NAMES_KO = {
    "AAPL": "애플", "MSFT": "마이크로소프트", "GOOGL": "구글", "AMZN": "아마존",
    "NVDA": "엔비디아", "META": "메타", "TSLA": "테슬라", "BRK-B": "버크셔 해서웨이",
    "LLY": "일라이 릴리", "V": "비자", "JPM": "JP모건", "UNH": "유나이티드헬스",
    "XOM": "엑슨모빌", "MA": "마스터카드", "JNJ": "존슨앤드존슨", "PG": "P&G",
    "AVGO": "브로드컴", "HD": "홈디포", "COST": "코스트코", "MRK": "머크",
    "ABBV": "애브비", "CRM": "세일즈포스", "AMD": "AMD", "NFLX": "넷플릭스",
    "KO": "코카콜라", "PEP": "펩시코", "TMO": "써모피셔", "ADBE": "어도비",
    "WMT": "월마트", "ORCL": "오라클", "DIS": "디즈니", "BA": "보잉",
    "INTC": "인텔", "QCOM": "퀄컴", "UBER": "우버", "IBM": "IBM",
}

KR_STOCK_NAMES_EN = {
    "005930.KS": "Samsung Electronics", "000660.KS": "SK Hynix",
    "373220.KS": "LG Energy Solution", "207940.KS": "Samsung Biologics",
    "006400.KS": "Samsung SDI", "005380.KS": "Hyundai Motor",
    "051910.KS": "LG Chem", "000270.KS": "Kia", "068270.KS": "Celltrion",
    "035420.KS": "Naver", "035720.KS": "Kakao", "005490.KS": "POSCO Holdings",
    "028260.KS": "Samsung C&T", "012450.KS": "Hanwha Aerospace",
    "055550.KS": "Shinhan Financial", "105560.KS": "KB Financial",
    "017670.KS": "SK Telecom", "032830.KS": "Samsung Life",
    "066570.KS": "LG Electronics", "003670.KS": "POSCO Future M",
    "034020.KS": "Doosan Enerbility", "030200.KS": "KT Corp",
    "012330.KS": "Hyundai Mobis", "259960.KS": "Krafton",
    "352820.KS": "HYBE", "036570.KS": "NCsoft", "323410.KS": "KakaoBank",
    "009150.KS": "Samsung Electro-Mechanics", "018260.KS": "Samsung SDS",
    "033780.KS": "KT&G", "377300.KS": "KakaoPay",
}


def search_stocks(query: str) -> list:
    results = []

    matched_tickers = set()
    for name, ticker in KOREAN_STOCKS.items():
        if query in name and ticker not in matched_tickers:
            matched_tickers.add(ticker)
            results.append({
                "ticker": ticker,
                "name": KR_STOCK_NAMES_EN.get(ticker, name),
                "name_en": KR_STOCK_NAMES_EN.get(ticker, name),
                "name_ko": name,
                "exchange": "KSC",
                "type": "EQUITY",
            })

    try:
        url = "https://query2.finance.yahoo.com/v1/finance/search"
        params = {
            "q": query,
            "quotesCount": 10,
            "newsCount": 0,
            "listsCount": 0,
        }
        headers = {"User-Agent": "Mozilla/5.0"}
        res = requests.get(url, params=params, headers=headers, timeout=5)
        data = res.json()
        for q in data.get("quotes", []):
            if q.get("quoteType") == "EQUITY" and q.get("symbol") not in matched_tickers:
                ticker = q.get("symbol", "")
                en_name = q.get("shortname") or q.get("longname", "")
                ko_name = US_STOCK_NAMES_KO.get(ticker) or KR_STOCK_NAMES_EN.get(ticker) or en_name
                if ticker in KOREAN_STOCKS.values():
                    ko_name = next((name for name, t in KOREAN_STOCKS.items() if t == ticker), en_name)
                results.append({
                    "ticker": ticker,
                    "name": en_name,
                    "name_en": en_name,
                    "name_ko": ko_name,
                    "exchange": q.get("exchange", ""),
                    "type": q.get("quoteType", ""),
                })
    except Exception:
        pass

    return results
    


def get_stock_price(ticker: str) -> float | None:
    now = time.time()

    # Return cached price if still fresh
    cached = _price_cache.get(ticker)
    if cached and now - cached["ts"] < PRICE_CACHE_TTL:
        return cached["value"]

    try:
        stock = yf.Ticker(ticker)
        data = stock.history(period="1d")
        if data.empty:
            return None
        price = round(float(data["Close"].iloc[-1]), 2)
        _price_cache[ticker] = {"value": price, "ts": now}
        return price
    except Exception:
        # If fetch fails, return stale cache if available
        if cached:
            return cached["value"]
        return None


def get_stock_info(ticker: str) -> dict | None:
    now = time.time()

    # Return cached info if still fresh
    cached = _info_cache.get(ticker)
    if cached and now - cached["ts"] < INFO_CACHE_TTL:
        # Update the price field with the latest cached price
        result = cached["value"].copy()
        result["price"] = get_stock_price(ticker)
        return result

    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        if not info or "shortName" not in info:
            return None

        is_kr = ticker.endswith(".KS") or ticker.endswith(".KQ")
        en_name = info.get("shortName", "")
        ko_name = en_name

        if is_kr:
            ko_name = KOREAN_STOCKS.get(ticker) or next(
                (name for name, t in KOREAN_STOCKS.items() if t == ticker), en_name
            )
            en_name = KR_STOCK_NAMES_EN.get(ticker, en_name)
        else:
            ko_name = US_STOCK_NAMES_KO.get(ticker, en_name)

        result = {
            "ticker": ticker,
            "name": en_name,
            "name_en": en_name,
            "name_ko": ko_name,
            "sector": info.get("sector", "Unknown"),
            "industry": info.get("industry", "Unknown"),
            "market": "KRX" if is_kr else "US",
            "currency": "KRW" if is_kr else "USD",
            "marketCap": info.get("marketCap", 0),
        }

        _info_cache[ticker] = {"value": result, "ts": now}

        # Get price separately (uses its own cache) and attach it
        result_with_price = result.copy()
        result_with_price["price"] = get_stock_price(ticker)
        return result_with_price

    except Exception:
        if cached:
            result = cached["value"].copy()
            result["price"] = get_stock_price(ticker)
            return result
        return None