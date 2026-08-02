"""Any authenticated account can create rows without limit.

Registration is open, every trade writes both a transaction and a snapshot, and
game sessions were uncapped, so one account could fill the database cheaply.
"""

BUY = {"ticker": "AAPL", "quantity": 1}
NEW_SESSION = {"duration_days": 90, "starting_balance_krw": 1_000_000}


def _register(client, username):
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": "strong123"},
        headers={"X-Forwarded-For": f"203.0.113.{abs(hash(username)) % 200 + 1}"},
    )
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_trades_are_throttled_per_user(client, auth_headers):
    from app.services.public_rate_limit import TRADE_LIMIT

    for _ in range(TRADE_LIMIT):
        client.post("/trade/buy", json=BUY, headers=auth_headers)

    resp = client.post("/trade/buy", json=BUY, headers=auth_headers)
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1


def test_one_user_does_not_throttle_another(client, auth_headers):
    from app.services.public_rate_limit import TRADE_LIMIT

    for _ in range(TRADE_LIMIT + 5):
        client.post("/trade/buy", json=BUY, headers=auth_headers)

    other = _register(client, "second-trader")
    assert client.post("/trade/buy", json=BUY, headers=other).status_code != 429


def test_active_sessions_are_capped(client, auth_headers):
    from app.routes.game import MAX_ACTIVE_SESSIONS

    for _ in range(MAX_ACTIVE_SESSIONS):
        resp = client.post("/game/sessions", json=NEW_SESSION, headers=auth_headers)
        assert resp.status_code == 200

    resp = client.post("/game/sessions", json=NEW_SESSION, headers=auth_headers)
    assert resp.status_code == 409


def test_cap_also_applies_to_the_legacy_new_game_route(client, auth_headers):
    from app.routes.game import MAX_ACTIVE_SESSIONS

    for _ in range(MAX_ACTIVE_SESSIONS):
        client.post("/game/sessions", json=NEW_SESSION, headers=auth_headers)

    resp = client.post("/game/new", json=NEW_SESSION, headers=auth_headers)
    assert resp.status_code == 409
