"""The benchmark window is attacker-controlled and the route is unauthenticated.

Each call is an uncached history download from Yahoo, so an unbounded `days`
lets a single request pull the entire available series of ^GSPC.
"""

import pytest

from app.services import benchmark_service


@pytest.mark.parametrize("days", [9_999_999, 100_000, 3_651])
def test_benchmark_rejects_oversized_window(client, days):
    assert client.get(f"/game/benchmark/SP500?days={days}").status_code == 422


@pytest.mark.parametrize("days", [0, -5, 1])
def test_benchmark_rejects_degenerate_window(client, days):
    assert client.get(f"/game/benchmark/SP500?days={days}").status_code == 422


def test_benchmark_accepts_a_realistic_window(client, monkeypatch):
    monkeypatch.setattr(
        benchmark_service.market_data_provider,
        "get_close_history",
        lambda symbol, start: [],
    )
    assert client.get("/game/benchmark/SP500?days=90").status_code == 200
    assert client.get("/game/benchmark/SP500").status_code == 200
