"""Throttles for routes that are cheap to call and expensive to serve.

Market data proxies to Yahoo and only populates its caches on success, so a
miss always costs an outbound call; without a ceiling one client can exhaust
the deployment's upstream quota. Trades are cheap for the caller too but each
writes a transaction and a snapshot row.

Both limits are keyed per caller rather than process-wide for the same reason
the auth limiter is: a shared counter lets one client deny the route to all.
"""

from fastapi import Depends, HTTPException, Request, status

from app.auth import get_current_user
from app.models import User
from app.services.auth_rate_limit import InMemoryWindowRateLimiter, client_address

# Generous next to normal browsing (a page view costs a handful of calls) while
# still bounding a scripted loop. Sized to tolerate several users behind one NAT.
MARKET_DATA_LIMIT = 120
MARKET_DATA_WINDOW_SECONDS = 60
RATE_LIMIT_DETAIL = "Too many market data requests. Try again later."

# Far above any human trading pace, so this only ever catches a script.
TRADE_LIMIT = 60
TRADE_WINDOW_SECONDS = 60
TRADE_RATE_LIMIT_DETAIL = "Too many trades. Try again in a moment."

market_data_rate_limiter = InMemoryWindowRateLimiter()
trade_rate_limiter = InMemoryWindowRateLimiter()


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


def enforce_trade_rate_limit(current_user: User = Depends(get_current_user)) -> None:
    """Keyed on the account, not the address, so sharing an office NAT does not
    make one user's activity throttle another's."""
    retry_after = trade_rate_limiter.hit(
        f"trade:{current_user.id}",
        limit=TRADE_LIMIT,
        window_seconds=TRADE_WINDOW_SECONDS,
    )
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=TRADE_RATE_LIMIT_DETAIL,
            headers={"Retry-After": str(retry_after)},
        )
