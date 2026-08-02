"""CORS policy.

Production is identified by FRONTEND_URL being set (render.yaml declares it
sync:false). Local dev leaves it unset, so the dev-server origins apply only
there and never ship in the deployed allowlist.
"""

def test_production_origins_exclude_localhost():
    from app.main import resolve_allowed_origins

    origins = resolve_allowed_origins({"FRONTEND_URL": "https://stock-game-gray.vercel.app"})
    assert origins == ["https://stock-game-gray.vercel.app"]
    assert not any("localhost" in origin for origin in origins)


def test_dev_origins_apply_when_frontend_url_absent():
    from app.main import resolve_allowed_origins

    origins = resolve_allowed_origins({})
    assert "http://localhost:5173" in origins
    assert "http://localhost:3000" in origins


def test_preflight_does_not_allow_credentials(client):
    """The API authenticates with a Bearer header, never a cookie, so credentialed
    cross-origin requests should not be sanctioned."""
    resp = client.options(
        "/portfolio/holdings",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-credentials") != "true"


def test_unlisted_origin_is_still_refused(client):
    resp = client.options(
        "/portfolio/holdings",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") is None
