import yfinance as yf
import requests
import time

# ── Caches ──────────────────────────────────────────────────────────
_price_cache: dict[str, dict] = {}
PRICE_CACHE_TTL = 300

_info_cache: dict[str, dict] = {}
INFO_CACHE_TTL = 600

# ── Korean Stocks: Korean search name → ticker ──────────────────────
KOREAN_STOCKS = {
    "삼성전자": "005930.KS", "삼성": "005930.KS",
    "SK하이닉스": "000660.KS", "하이닉스": "000660.KS",
    "카카오": "035720.KS", "네이버": "035420.KS",
    "현대차": "005380.KS", "현대자동차": "005380.KS",
    "기아": "000270.KS", "셀트리온": "068270.KS",
    "LG에너지솔루션": "373220.KS", "LG화학": "051910.KS",
    "포스코홀딩스": "005490.KS", "삼성바이오로직스": "207940.KS",
    "삼성SDI": "006400.KS", "카카오뱅크": "323410.KS",
    "카카오페이": "377300.KS", "크래프톤": "259960.KS",
    "하이브": "352820.KS", "엔씨소프트": "036570.KS",
    "삼성물산": "028260.KS", "한화에어로스페이스": "012450.KS",
    "두산에너빌리티": "034020.KS", "현대모비스": "012330.KS",
    "KB금융": "105560.KS", "신한지주": "055550.KS",
    "삼성생명": "032830.KS", "LG전자": "066570.KS",
    "SK텔레콤": "017670.KS", "KT": "030200.KS",
    "삼성전기": "009150.KS", "삼성SDS": "018260.KS",
    "KT&G": "033780.KS", "하나금융지주": "086790.KS",
    "고려아연": "010130.KS", "SK이노베이션": "096770.KS",
    "LG": "003550.KS", "포스코퓨처엠": "003670.KS",
    "한화오션": "042660.KS", "HD한국조선해양": "009540.KS",
    "HD현대중공업": "329180.KS", "한화솔루션": "009830.KS",
    "SK": "034730.KS", "SK스퀘어": "402340.KS",
    "우리금융지주": "316140.KS", "한국전력": "015760.KS",
    "삼성화재": "000810.KS", "메리츠금융지주": "138040.KS",
    "넷마블": "251270.KS", "펄어비스": "263750.KS",
    "CJ제일제당": "097950.KS", "아모레퍼시픽": "090430.KS",
    "LG생활건강": "051900.KS", "한국타이어앤테크놀로지": "161390.KS",
    "SK바이오팜": "326030.KS", "에코프로비엠": "247540.KS",
    "에코프로": "086520.KS", "POSCO DX": "022100.KS",
    "삼성중공업": "010140.KS", "현대건설": "000720.KS",
    "대한항공": "003490.KS", "LG이노텍": "011070.KS",
    "현대제철": "004020.KS", "기업은행": "024110.KS",
    "미래에셋증권": "006800.KS", "한국금융지주": "071050.KS",
    "SK케미칼": "285130.KS", "두산밥캣": "241560.KS",
    "삼성에스디에스": "018260.KS", "CJ ENM": "035760.KS",
    "한화생명": "088350.KS", "LG디스플레이": "034220.KS",
    "현대글로비스": "086280.KS", "S-Oil": "010950.KS",
    "삼성증권": "016360.KS", "한미반도체": "042700.KS",
    "DB손해보험": "005830.KS", "NH투자증권": "005940.KS",
    "코웨이": "021240.KS", "HLB": "028300.KS",
    "금양": "001570.KS", "두산로보틱스": "454910.KS",
    "리노공업": "058470.KS", "레인보우로보틱스": "277810.KS",
    "LS일렉트릭": "010120.KS", "HD현대일렉트릭": "267260.KS",
    "한전KPS": "051600.KS", "유한양행": "000100.KS",
    "삼성바이오에피스": "326030.KS", "녹십자": "006280.KS",
    "한미약품": "128940.KS", "SK바이오사이언스": "302440.KS",
}

# ── Korean Stocks: ticker → English name ─────────────────────────────
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
    "086790.KS": "Hana Financial", "010130.KS": "Korea Zinc",
    "096770.KS": "SK Innovation", "003550.KS": "LG Corp",
    "042660.KS": "Hanwha Ocean", "009540.KS": "HD Korea Shipbuilding",
    "329180.KS": "HD Hyundai Heavy Industries", "009830.KS": "Hanwha Solutions",
    "034730.KS": "SK Inc", "402340.KS": "SK Square",
    "316140.KS": "Woori Financial", "015760.KS": "KEPCO",
    "000810.KS": "Samsung Fire & Marine", "138040.KS": "Meritz Financial",
    "251270.KS": "Netmarble", "263750.KS": "Pearl Abyss",
    "097950.KS": "CJ CheilJedang", "090430.KS": "Amorepacific",
    "051900.KS": "LG H&H", "161390.KS": "Hankook Tire",
    "326030.KS": "SK Biopharm", "247540.KS": "Ecopro BM",
    "086520.KS": "Ecopro", "022100.KS": "POSCO DX",
    "010140.KS": "Samsung Heavy Industries", "000720.KS": "Hyundai E&C",
    "003490.KS": "Korean Air", "011070.KS": "LG Innotek",
    "004020.KS": "Hyundai Steel", "024110.KS": "IBK",
    "006800.KS": "Mirae Asset Securities", "071050.KS": "Korea Investment Holdings",
    "285130.KS": "SK Chemicals", "241560.KS": "Doosan Bobcat",
    "035760.KS": "CJ ENM", "088350.KS": "Hanwha Life",
    "034220.KS": "LG Display", "086280.KS": "Hyundai Glovis",
    "010950.KS": "S-Oil", "016360.KS": "Samsung Securities",
    "042700.KS": "Hanmi Semiconductor", "005830.KS": "DB Insurance",
    "005940.KS": "NH Investment", "021240.KS": "Coway",
    "028300.KS": "HLB", "001570.KS": "Kumyang",
    "454910.KS": "Doosan Robotics", "058470.KS": "LEENO Industrial",
    "277810.KS": "Rainbow Robotics", "010120.KS": "LS Electric",
    "267260.KS": "HD Hyundai Electric", "051600.KS": "KEPCO KPS",
    "000100.KS": "Yuhan Corp", "006280.KS": "Green Cross",
    "128940.KS": "Hanmi Pharm", "302440.KS": "SK Bioscience",
}

# ── US Stocks: ticker → Korean name ──────────────────────────────────
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
    "CSCO": "시스코", "ACN": "액센츄어", "TXN": "텍사스 인스트루먼트",
    "NOW": "서비스나우", "ISRG": "인튜이티브 서지컬", "AMGN": "암젠",
    "GS": "골드만삭스", "MS": "모건스탠리", "BLK": "블랙록",
    "SPGI": "S&P 글로벌", "AXP": "아메리칸 익스프레스", "PYPL": "페이팔",
    "BKNG": "부킹홀딩스", "GILD": "길리어드", "MDLZ": "몬델리즈",
    "SBUX": "스타벅스", "PFE": "화이자", "T": "AT&T",
    "VZ": "버라이즌", "CVX": "셰브론", "COP": "코노코필립스",
    "NEE": "넥스트에라 에너지", "LOW": "로우스", "UNP": "유니언 퍼시픽",
    "CAT": "캐터필러", "DE": "디어앤컴퍼니", "RTX": "RTX",
    "HON": "허니웰", "LMT": "록히드마틴", "GE": "GE에어로스페이스",
    "MMM": "3M", "ADP": "ADP", "FIS": "FIS",
    "LRCX": "램리서치", "KLAC": "KLA", "AMAT": "어플라이드 머티리얼즈",
    "MU": "마이크론", "PANW": "팔로알토 네트웍스", "SNPS": "시놉시스",
    "CDNS": "케이던스", "MRVL": "마벨 테크놀로지", "CRWD": "크라우드스트라이크",
    "ZS": "지스케일러", "SNOW": "스노우플레이크", "DDOG": "데이터독",
    "NET": "클라우드플레어", "SQ": "블록(스퀘어)", "SHOP": "쇼피파이",
    "COIN": "코인베이스", "RIVN": "리비안", "LCID": "루시드",
    "NKE": "나이키", "ABNB": "에어비앤비", "SPOT": "스포티파이",
    "SNAP": "스냅", "RBLX": "로블록스", "PLTR": "팔란티어",
    "ARM": "ARM홀딩스", "SMCI": "슈퍼마이크로", "MSTR": "마이크로스트래티지",
    "DELL": "델테크놀로지", "HPE": "HPE", "ROKU": "로쿠",
}

# ── US Stocks: ticker → English name ─────────────────────────────────
US_STOCK_NAMES_EN = {
    "AAPL": "Apple", "MSFT": "Microsoft", "GOOGL": "Alphabet", "AMZN": "Amazon",
    "NVDA": "NVIDIA", "META": "Meta Platforms", "TSLA": "Tesla", "BRK-B": "Berkshire Hathaway",
    "LLY": "Eli Lilly", "V": "Visa", "JPM": "JPMorgan Chase", "UNH": "UnitedHealth",
    "XOM": "Exxon Mobil", "MA": "Mastercard", "JNJ": "Johnson & Johnson", "PG": "Procter & Gamble",
    "AVGO": "Broadcom", "HD": "Home Depot", "COST": "Costco", "MRK": "Merck",
    "ABBV": "AbbVie", "CRM": "Salesforce", "AMD": "AMD", "NFLX": "Netflix",
    "KO": "Coca-Cola", "PEP": "PepsiCo", "TMO": "Thermo Fisher", "ADBE": "Adobe",
    "WMT": "Walmart", "ORCL": "Oracle", "DIS": "Disney", "BA": "Boeing",
    "INTC": "Intel", "QCOM": "Qualcomm", "UBER": "Uber", "IBM": "IBM",
    "CSCO": "Cisco", "ACN": "Accenture", "TXN": "Texas Instruments", "NOW": "ServiceNow",
    "ISRG": "Intuitive Surgical", "AMGN": "Amgen",
    "GS": "Goldman Sachs", "MS": "Morgan Stanley", "BLK": "BlackRock",
    "SPGI": "S&P Global", "AXP": "American Express", "PYPL": "PayPal",
    "BKNG": "Booking Holdings", "GILD": "Gilead Sciences", "MDLZ": "Mondelez",
    "SBUX": "Starbucks", "PFE": "Pfizer", "T": "AT&T",
    "VZ": "Verizon", "CVX": "Chevron", "COP": "ConocoPhillips",
    "NEE": "NextEra Energy", "LOW": "Lowe's", "UNP": "Union Pacific",
    "CAT": "Caterpillar", "DE": "Deere & Company", "RTX": "RTX",
    "HON": "Honeywell", "LMT": "Lockheed Martin", "GE": "GE Aerospace",
    "MMM": "3M", "ADP": "ADP", "FIS": "Fidelity National",
    "LRCX": "Lam Research", "KLAC": "KLA Corp", "AMAT": "Applied Materials",
    "MU": "Micron", "PANW": "Palo Alto Networks", "SNPS": "Synopsys",
    "CDNS": "Cadence Design", "MRVL": "Marvell Technology", "CRWD": "CrowdStrike",
    "ZS": "Zscaler", "SNOW": "Snowflake", "DDOG": "Datadog",
    "NET": "Cloudflare", "SQ": "Block (Square)", "SHOP": "Shopify",
    "COIN": "Coinbase", "RIVN": "Rivian", "LCID": "Lucid Motors",
    "NKE": "Nike", "ABNB": "Airbnb", "SPOT": "Spotify",
    "SNAP": "Snap Inc", "RBLX": "Roblox", "PLTR": "Palantir",
    "ARM": "Arm Holdings", "SMCI": "Super Micro Computer", "MSTR": "MicroStrategy",
    "DELL": "Dell Technologies", "HPE": "Hewlett Packard Enterprise", "ROKU": "Roku",
}


# ── Search ───────────────────────────────────────────────────────────
def search_stocks(query: str) -> list:
    results = []
    matched_tickers = set()
    query_lower = query.lower()

    # Search Korean stocks by Korean name
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

    # Also search Korean stocks by English name
    for ticker, en_name in KR_STOCK_NAMES_EN.items():
        if ticker not in matched_tickers and query_lower in en_name.lower():
            ko_name = next((n for n, t in KOREAN_STOCKS.items() if t == ticker), en_name)
            matched_tickers.add(ticker)
            results.append({
                "ticker": ticker,
                "name": en_name,
                "name_en": en_name,
                "name_ko": ko_name,
                "exchange": "KSC",
                "type": "EQUITY",
            })

    # Search US stocks by English name, Korean name, or ticker
    for ticker, en_name in US_STOCK_NAMES_EN.items():
        ko_name = US_STOCK_NAMES_KO.get(ticker, "")
        if ticker not in matched_tickers and (
            query_lower in en_name.lower() or query_lower in ticker.lower() or query in ko_name
        ):
            matched_tickers.add(ticker)
            results.append({
                "ticker": ticker,
                "name": en_name,
                "name_en": en_name,
                "name_ko": US_STOCK_NAMES_KO.get(ticker, en_name),
                "exchange": "NASDAQ/NYSE",
                "type": "EQUITY",
            })

    # Also try Yahoo Finance search API for stocks not in local dicts
    try:
        url = "https://query2.finance.yahoo.com/v1/finance/search"
        params = {"q": query, "quotesCount": 10, "newsCount": 0, "listsCount": 0}
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


# ── Price ────────────────────────────────────────────────────────────
def get_stock_price(ticker: str) -> float | None:
    now = time.time()

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
        if cached:
            return cached["value"]
        return None


# ── Stock Info (with cloud fallback) ─────────────────────────────────
def get_stock_info(ticker: str) -> dict | None:
    now = time.time()

    cached = _info_cache.get(ticker)
    if cached and now - cached["ts"] < INFO_CACHE_TTL:
        result = cached["value"].copy()
        result["price"] = get_stock_price(ticker)
        return result

    is_kr = ticker.endswith(".KS") or ticker.endswith(".KQ")

    # Try yfinance .info first
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        if info and "shortName" in info:
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

            result_with_price = result.copy()
            result_with_price["price"] = get_stock_price(ticker)
            return result_with_price

    except Exception:
        pass

    # Stale cache fallback
    if cached:
        result = cached["value"].copy()
        result["price"] = get_stock_price(ticker)
        return result

    # FALLBACK: .info failed — build from local name dicts + .history() price
    # This handles cloud servers where Yahoo blocks .info but .history works
    price = get_stock_price(ticker)
    if price is None:
        return None

    if is_kr:
        ko_name = next((name for name, t in KOREAN_STOCKS.items() if t == ticker), ticker)
        en_name = KR_STOCK_NAMES_EN.get(ticker, ko_name)
    else:
        en_name = US_STOCK_NAMES_EN.get(ticker, ticker)
        ko_name = US_STOCK_NAMES_KO.get(ticker, en_name)

    result = {
        "ticker": ticker,
        "name": en_name,
        "name_en": en_name,
        "name_ko": ko_name,
        "sector": "Unknown",
        "industry": "Unknown",
        "market": "KRX" if is_kr else "US",
        "currency": "KRW" if is_kr else "USD",
        "marketCap": 0,
        "price": price,
    }

    _info_cache[ticker] = {"value": {k: v for k, v in result.items() if k != "price"}, "ts": now}
    return result
