from app.services.auth_rate_limit import (
    LOGIN_IDENTITY_LIMIT,
    REGISTER_IDENTITY_LIMIT,
)


def test_login_rate_limit_returns_retry_after(client):
    payload = {"username": "rate-limited-user", "password": "wrong-password"}

    for _ in range(LOGIN_IDENTITY_LIMIT):
        assert client.post("/auth/login", json=payload).status_code == 401

    response = client.post("/auth/login", json=payload)

    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1
    assert response.json()["detail"] == "Too many authentication attempts. Try again later."


def test_register_rate_limit_returns_retry_after(client):
    payload = {"username": "register-limited", "password": "strong123"}

    assert client.post("/auth/register", json=payload).status_code == 201
    for _ in range(REGISTER_IDENTITY_LIMIT - 1):
        assert client.post("/auth/register", json=payload).status_code == 409

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1
