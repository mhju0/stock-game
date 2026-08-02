"""Security response headers.

The API is consumed cross-origin from Vercel, so it cannot rely on the frontend
CDN's headers to protect its own responses.
"""

EXPECTED_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
}


def test_ok_response_carries_security_headers(client):
    resp = client.get("/")
    assert resp.status_code == 200
    for header, value in EXPECTED_HEADERS.items():
        assert resp.headers.get(header) == value


def test_error_response_carries_security_headers(client):
    """Error paths are the easiest place to forget hardening."""
    resp = client.get("/portfolio/holdings")
    assert resp.status_code in (401, 403)
    for header, value in EXPECTED_HEADERS.items():
        assert resp.headers.get(header) == value


def test_hsts_is_advertised(client):
    hsts = client.get("/").headers.get("strict-transport-security")
    assert hsts is not None
    assert "max-age=" in hsts
