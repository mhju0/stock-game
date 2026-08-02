"""Small, process-local throttle for public authentication endpoints.

The production service intentionally runs one Gunicorn worker, so a bounded
in-memory window gives the demo useful brute-force and signup-abuse protection
without adding Redis or another persistence dependency. Limits reset whenever
the worker process restarts, including deploys and routine worker recycling.
"""

from __future__ import annotations

from collections import OrderedDict, deque
from math import ceil
from threading import Lock
from time import monotonic

from fastapi import HTTPException, status


LOGIN_IDENTITY_LIMIT = 10
LOGIN_IP_LIMIT = 20
LOGIN_GLOBAL_LIMIT = 600
LOGIN_WINDOW_SECONDS = 60

REGISTER_IDENTITY_LIMIT = 5
REGISTER_IP_LIMIT = 5
REGISTER_GLOBAL_LIMIT = 100
REGISTER_WINDOW_SECONDS = 10 * 60

MAX_TRACKED_KEYS = 10_000
RATE_LIMIT_DETAIL = "Too many authentication attempts. Try again later."


class InMemoryWindowRateLimiter:
    def __init__(self, max_keys: int = MAX_TRACKED_KEYS):
        self._max_keys = max_keys
        self._events: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = Lock()

    def hit(self, key: str, *, limit: int, window_seconds: int) -> int | None:
        """Record an attempt and return Retry-After seconds when blocked."""
        now = monotonic()
        cutoff = now - window_seconds

        with self._lock:
            events = self._events.get(key)
            if events is None:
                events = deque()
                self._events[key] = events
            else:
                self._events.move_to_end(key)

            while events and events[0] <= cutoff:
                events.popleft()

            if len(events) >= limit:
                return max(1, ceil(window_seconds - (now - events[0])))

            events.append(now)
            while len(self._events) > self._max_keys:
                self._events.popitem(last=False)

        return None

    def reset(self) -> None:
        """Clear state for isolated tests."""
        with self._lock:
            self._events.clear()


auth_rate_limiter = InMemoryWindowRateLimiter()


def client_address(request) -> str:
    """The address a request is billed to.

    A client can send its own X-Forwarded-For and the platform proxy appends the
    real peer to it, so only the rightmost entry is beyond the client's control.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client else "unknown"


def enforce_auth_rate_limit(
    scope: str,
    identity: str,
    address: str,
    *,
    identity_limit: int,
    ip_limit: int,
    global_limit: int,
    window_seconds: int,
) -> None:
    """Apply identity, per-address and process-wide limits, in that order.

    The per-address bucket is the control that stops one client from spending
    everyone else's budget. Because a single address is cut off long before the
    process-wide ceiling, that ceiling is a resource backstop against a genuinely
    distributed flood rather than something one client can trip.
    """
    _apply(
        (
            (f"{scope}:identity:{_normalize(identity)}", identity_limit),
            (f"{scope}:ip:{address}", ip_limit),
            (f"{scope}:global", global_limit),
        ),
        window_seconds,
    )


def enforce_request_rate_limit(
    scope: str,
    address: str,
    *,
    ip_limit: int,
    global_limit: int,
    window_seconds: int,
) -> None:
    """Address and process-wide ceilings only, applied before any expensive work.

    Callers that verify credentials use this first so the per-address ceiling
    still bounds how many password hashes one client can force.
    """
    _apply(
        (
            (f"{scope}:ip:{address}", ip_limit),
            (f"{scope}:global", global_limit),
        ),
        window_seconds,
    )


def register_identity_failure(
    scope: str,
    identity: str,
    *,
    identity_limit: int,
    window_seconds: int,
) -> None:
    """Count one failed attempt against an account and reject once over budget.

    Consulted only after credentials are checked and only when they were wrong,
    so a third party cannot spend an account's budget to lock its owner out. A
    correct password never reaches this limit.
    """
    _apply(
        ((f"{scope}:identity:{_normalize(identity)}", identity_limit),),
        window_seconds,
    )


def _normalize(identity: str) -> str:
    return identity.strip().casefold() or "<empty>"


def _apply(checks, window_seconds: int) -> None:
    for key, limit in checks:
        retry_after = auth_rate_limiter.hit(
            key,
            limit=limit,
            window_seconds=window_seconds,
        )
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=RATE_LIMIT_DETAIL,
                headers={"Retry-After": str(retry_after)},
            )
