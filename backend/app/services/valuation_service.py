from app.services.stock_service import get_stock_price, get_stock_info


def resolved_sector(info: dict | None, holding_sector: str | None) -> str | None:
    """Prefer enriched get_stock_info (static + Yahoo) over DB snapshot. Returns None if unknown."""
    i = info or {}
    s = i.get("sector")
    if s and s != "Unknown":
        return s
    if holding_sector and holding_sector != "Unknown":
        return holding_sector
    return None


def resolved_industry(info: dict | None, holding_industry: str | None) -> str | None:
    i = info or {}
    s = i.get("industry")
    if s and s != "Unknown":
        return s
    if holding_industry and holding_industry != "Unknown":
        return holding_industry
    return None


def get_prices_for_tickers(tickers: list[str]) -> dict[str, float | None]:
    unique = list(dict.fromkeys(tickers))
    return {ticker: get_stock_price(ticker) for ticker in unique}


def get_infos_for_tickers(tickers: list[str]) -> dict[str, dict]:
    unique = list(dict.fromkeys(tickers))
    result: dict[str, dict] = {}
    for ticker in unique:
        result[ticker] = get_stock_info(ticker) or {}
    return result


def compute_user_total_value_krw(user, holdings, rate: float, prices: dict[str, float | None] | None = None) -> float:
    if prices is None:
        prices = get_prices_for_tickers([h.ticker for h in holdings])

    holdings_value_krw = 0.0
    for h in holdings:
        price = prices.get(h.ticker)
        if price is None:
            continue
        value = price * h.quantity
        if h.currency == "USD":
            value *= rate
        holdings_value_krw += value

    return user.balance_krw + (user.balance_usd * rate) + holdings_value_krw
