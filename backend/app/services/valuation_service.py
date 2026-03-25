from app.services.stock_service import get_stock_price, get_stock_info


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
