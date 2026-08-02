"""One client must not be able to exhaust everyone else's auth budget.

The limiter kept a single process-wide counter, so a few hundred requests from
one address returned 429 to every user for the rest of the window. Per-address
buckets make the global counter a resource backstop rather than the control a
single client can trip.
"""

ATTACKER = {"X-Forwarded-For": "203.0.113.9"}
VICTIM = {"X-Forwarded-For": "198.51.100.7"}


def _flood_login(client, headers, count):
    for index in range(count):
        client.post(
            "/auth/login",
            json={"username": f"probe{index}", "password": "wrong-password"},
            headers=headers,
        )


def test_one_address_cannot_lock_out_another(client):
    _flood_login(client, ATTACKER, 320)

    resp = client.post(
        "/auth/login",
        json={"username": "victim", "password": "wrong-password"},
        headers=VICTIM,
    )
    assert resp.status_code == 401


def test_address_is_capped_on_its_own_budget(client):
    from app.services.auth_rate_limit import LOGIN_IP_LIMIT

    _flood_login(client, ATTACKER, LOGIN_IP_LIMIT)

    resp = client.post(
        "/auth/login",
        json={"username": "someone-else", "password": "wrong-password"},
        headers=ATTACKER,
    )
    assert resp.status_code == 429


def test_spoofed_forwarded_prefix_does_not_buy_budget(client):
    """The platform proxy appends the real peer last, so a client-supplied
    prefix must not open a fresh bucket."""
    from app.services.auth_rate_limit import LOGIN_IP_LIMIT

    for index in range(LOGIN_IP_LIMIT):
        client.post(
            "/auth/login",
            json={"username": f"probe{index}", "password": "wrong-password"},
            headers={"X-Forwarded-For": f"10.0.0.{index}, 203.0.113.9"},
        )

    resp = client.post(
        "/auth/login",
        json={"username": "final", "password": "wrong-password"},
        headers={"X-Forwarded-For": "10.9.9.9, 203.0.113.9"},
    )
    assert resp.status_code == 429


def test_registration_is_capped_per_address(client):
    from app.services.auth_rate_limit import REGISTER_IP_LIMIT

    for index in range(REGISTER_IP_LIMIT):
        client.post(
            "/auth/register",
            json={"username": f"newuser{index}", "password": "strong123"},
            headers=ATTACKER,
        )

    resp = client.post(
        "/auth/register",
        json={"username": "onemore", "password": "strong123"},
        headers=ATTACKER,
    )
    assert resp.status_code == 429

    # A different address is unaffected.
    resp = client.post(
        "/auth/register",
        json={"username": "elsewhere", "password": "strong123"},
        headers=VICTIM,
    )
    assert resp.status_code == 201
