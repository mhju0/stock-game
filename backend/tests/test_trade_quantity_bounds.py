"""Trade quantity needs a ceiling, not just a floor.

Python integers are unbounded, so `gt=0` alone let a caller submit a value with
hundreds of digits. Multiplying it by a float price raises OverflowError inside
the handler and returns a 500 rather than a validation failure.
"""

import pytest

ABSURD = b'{"ticker":"AAPL","quantity":1' + b"0" * 400 + b"}"


def _json_headers(auth_headers):
    return {**auth_headers, "Content-Type": "application/json"}


@pytest.mark.parametrize("path", ["/trade/buy", "/trade/sell"])
def test_absurd_quantity_is_a_validation_failure(client, auth_headers, path):
    resp = client.post(path, content=ABSURD, headers=_json_headers(auth_headers))
    assert resp.status_code == 422


@pytest.mark.parametrize("path", ["/trade/buy", "/trade/sell"])
def test_absurd_quantity_never_yields_a_server_error(client, auth_headers, path):
    resp = client.post(path, content=ABSURD, headers=_json_headers(auth_headers))
    assert resp.status_code < 500


def test_a_large_but_plausible_quantity_still_reaches_the_balance_check(client, auth_headers):
    """The ceiling must sit above anything a real portfolio could hold, so this
    is rejected for lacking funds rather than for failing validation."""
    resp = client.post(
        "/trade/buy",
        json={"ticker": "AAPL", "quantity": 1_000_000},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "Insufficient" in resp.json()["detail"]
