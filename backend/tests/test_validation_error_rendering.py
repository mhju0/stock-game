"""A rejected value must not be able to break the rejection itself.

Starlette renders JSON with allow_nan=False and FastAPI's default 422 body
echoes the rejected input, so a non-finite float turned a clean validation
failure into a 500. Reporting only the location and reason fixes that and stops
reflecting caller input back at the same time.
"""

import pytest

NON_FINITE_EXCHANGE = b'{"from_currency":"KRW","to_currency":"USD","amount":Infinity}'
NON_FINITE_SESSION = b'{"title":"x","duration_days":90,"starting_balance_krw":Infinity}'


def _json_headers(auth_headers):
    return {**auth_headers, "Content-Type": "application/json"}


def test_non_finite_exchange_amount_is_a_clean_422(client, auth_headers):
    resp = client.post(
        "/trade/exchange",
        content=NON_FINITE_EXCHANGE,
        headers=_json_headers(auth_headers),
    )
    assert resp.status_code == 422


def test_non_finite_starting_balance_is_a_clean_422(client, auth_headers):
    resp = client.post(
        "/game/sessions",
        content=NON_FINITE_SESSION,
        headers=_json_headers(auth_headers),
    )
    assert resp.status_code == 422


def test_validation_body_reports_reason_without_echoing_input(client, auth_headers):
    resp = client.post(
        "/trade/buy",
        json={"ticker": "AAPL", "quantity": 0.5},
        headers=auth_headers,
    )
    assert resp.status_code == 422

    detail = resp.json()["detail"]
    assert detail, "a validation failure must still say what went wrong"
    for item in detail:
        assert "input" not in item
        assert item["msg"]
        assert item["loc"]


@pytest.mark.parametrize(
    "path,body",
    [
        ("/trade/exchange", NON_FINITE_EXCHANGE),
        ("/game/sessions", NON_FINITE_SESSION),
    ],
)
def test_non_finite_input_never_yields_a_server_error(client, auth_headers, path, body):
    resp = client.post(path, content=body, headers=_json_headers(auth_headers))
    assert resp.status_code < 500
