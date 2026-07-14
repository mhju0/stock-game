from app.services import market_data_provider

# Backward-compatible cache handle for existing tests and maintenance helpers.
cached_rate = market_data_provider._exchange_rate_cache


def get_exchange_rate() -> float:
    global cached_rate
    if cached_rate is not market_data_provider._exchange_rate_cache:
        market_data_provider._exchange_rate_cache = cached_rate
    rate = market_data_provider.get_exchange_rate()
    cached_rate = market_data_provider._exchange_rate_cache
    return rate
