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
LOGIN_GLOBAL_LIMIT = 300
LOGIN_WINDOW_SECONDS = 60

REGISTER_IDENTITY_LIMIT = 5
REGISTER_GLOBAL_LIMIT = 30
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


def enforce_auth_rate_limit(
    scope: str,
    identity: str,
    *,
    identity_limit: int,
    global_limit: int,
    window_seconds: int,
) -> None:
    """Apply a normalized identity limit plus a process-wide safety ceiling."""
    normalized_identity = identity.strip().casefold() or "<empty>"
    checks = (
        (f"{scope}:identity:{normalized_identity}", identity_limit),
        (f"{scope}:global", global_limit),
    )

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
