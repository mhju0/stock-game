"""Login must spend one password-hash check whether or not the account exists.

An unknown username used to skip bcrypt entirely, so the response time told a
caller which usernames were registered.
"""

import app.routes.auth as auth_routes

PASSWORD = "correct123"


def _count_hash_checks(monkeypatch):
    calls = []
    real = auth_routes.verify_password

    def counting(plain, hashed):
        calls.append(hashed)
        return real(plain, hashed)

    monkeypatch.setattr(auth_routes, "verify_password", counting)
    return calls


def test_unknown_username_still_costs_one_hash_check(client, monkeypatch):
    calls = _count_hash_checks(monkeypatch)

    resp = client.post("/auth/login", json={"username": "nobody-here", "password": PASSWORD})

    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid username or password"
    assert len(calls) == 1


def test_known_username_costs_the_same_single_check(client, monkeypatch):
    client.post("/auth/register", json={"username": "someone", "password": PASSWORD})
    calls = _count_hash_checks(monkeypatch)

    wrong = client.post("/auth/login", json={"username": "someone", "password": "wrong-pass1"})
    right = client.post("/auth/login", json={"username": "someone", "password": PASSWORD})

    assert (wrong.status_code, right.status_code) == (401, 200)
    assert len(calls) == 2


def test_the_placeholder_hash_never_grants_a_login(client):
    for guess in ("", "password", auth_routes.PLACEHOLDER_PASSWORD_HASH):
        resp = client.post("/auth/login", json={"username": "nobody-here", "password": guess or "x"})
        assert resp.status_code == 401
