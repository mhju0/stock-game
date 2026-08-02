"""An account must not be lockable out of its own login by a third party.

The per-username budget was consumed before credentials were checked, so anyone
who knew a username could spend it from any address and the owner's correct
password then met a 429 instead of signing in.
"""

from app.services.auth_rate_limit import LOGIN_IDENTITY_LIMIT

ATTACKER = {"X-Forwarded-For": "203.0.113.77"}
VICTIM = {"X-Forwarded-For": "198.51.100.11"}
PASSWORD = "correct123"


def _register(client, username):
    resp = client.post(
        "/auth/register",
        json={"username": username, "password": PASSWORD},
        headers=VICTIM,
    )
    assert resp.status_code == 201


def test_a_third_party_cannot_lock_an_account_out(client):
    _register(client, "victim")

    for _ in range(LOGIN_IDENTITY_LIMIT + 3):
        client.post(
            "/auth/login",
            json={"username": "victim", "password": "wrong-password"},
            headers=ATTACKER,
        )

    resp = client.post(
        "/auth/login",
        json={"username": "victim", "password": PASSWORD},
        headers=VICTIM,
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]


def test_failed_attempts_are_still_capped_per_username(client):
    _register(client, "target")

    for _ in range(LOGIN_IDENTITY_LIMIT):
        resp = client.post(
            "/auth/login",
            json={"username": "target", "password": "wrong-password"},
            headers=ATTACKER,
        )
        assert resp.status_code == 401

    resp = client.post(
        "/auth/login",
        json={"username": "target", "password": "wrong-password"},
        headers=ATTACKER,
    )
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1


def test_a_correct_password_does_not_consume_the_account_budget(client):
    _register(client, "frequent")

    for _ in range(LOGIN_IDENTITY_LIMIT + 5):
        resp = client.post(
            "/auth/login",
            json={"username": "frequent", "password": PASSWORD},
            headers=VICTIM,
        )
        assert resp.status_code == 200
