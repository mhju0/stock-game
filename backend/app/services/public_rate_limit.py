"""Per-address throttle for the unauthenticated market-data routes.

These routes proxy to Yahoo and only populate their caches on success, so a
cache miss always costs an outbound call. Without a ceiling, one client can
exhaust the deployment's upstream quota and take market data down for everyone.

The limit is per address rather than process-wide for the same reason the auth
limiter is: a shared counter would let one client deny the endpoint to all.
"""

from fastapi import HTTPException, Request, status

from app.services.auth_rate_limit import InMemoryWindowRateLimiter, client_address

# Generous next to normal browsing (a page view costs a handful of calls) while
# still bounding a scripted loop. Sized to tolerate several users behind one NAT.
MARKET_DATA_LIMIT = 120
MARKET_DATA_WINDOW_SECONDS = 60
RATE_LIMIT_DETAIL = "Too many market data requests. Try again later."

market_data_rate_limiter = InMemoryWindowRateLimiter()


def enforce_market_data_rate_limit(request: Request) -> None:
    retry_after = market_data_rate_limiter.hit(
        f"market:{client_address(request)}",
        limit=MARKET_DATA_LIMIT,
        window_seconds=MARKET_DATA_WINDOW_SECONDS,
    )
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=RATE_LIMIT_DETAIL,
            headers={"Retry-After": str(retry_after)},
        )
