from datetime import datetime, timedelta, timezone

import jwt


SECRET = "test-secret-key-for-pytest-do-not-use-in-prod"
ALGORITHM = "HS256"


class TestRegisterAndLogin:
    def test_register_returns_valid_jwt(self, client):
        resp = client.post("/auth/register", json={"username": "alice", "password": "pw123456"})
        assert resp.status_code == 201
        body = resp.json()
        assert "access_token" in body
        payload = jwt.decode(body["access_token"], SECRET, algorithms=[ALGORITHM])
        assert str(body["user_id"]) == payload["sub"]
        assert body["username"] == payload["username"]

    def test_login_returns_same_user_id(self, client):
        client.post("/auth/register", json={"username": "bob", "password": "pw123456"})
        resp = client.post("/auth/login", json={"username": "bob", "password": "pw123456"})
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body

        payload = jwt.decode(body["access_token"], SECRET, algorithms=[ALGORITHM])
        assert str(body["user_id"]) == payload["sub"]

    def test_login_wrong_password_rejected(self, client):
        client.post("/auth/register", json={"username": "carol", "password": "correct1"})
        resp = client.post("/auth/login", json={"username": "carol", "password": "wrong"})
        assert resp.status_code == 401

    def test_login_rejects_password_over_bcrypt_byte_limit(self, client):
        password = "가" * 25
        assert client.post(
            "/auth/login",
            json={"username": "carol", "password": password},
        ).status_code == 422

    def test_duplicate_username_rejected(self, client):
        client.post("/auth/register", json={"username": "dave", "password": "pw123456"})
        resp = client.post("/auth/register", json={"username": "dave", "password": "other123"})
        assert resp.status_code == 409

    def test_register_rejects_short_credentials(self, client):
        # Empty/too-short username or password must be rejected (422), never
        # silently create a passwordless or trivially weak account.
        assert client.post("/auth/register", json={"username": "", "password": ""}).status_code == 422
        assert client.post("/auth/register", json={"username": "ab", "password": "pw123456"}).status_code == 422
        assert client.post("/auth/register", json={"username": "eve", "password": "pw"}).status_code == 422

    def test_register_requires_letters_and_numbers(self, client):
        assert client.post(
            "/auth/register",
            json={"username": "letters", "password": "onlyletters"},
        ).status_code == 422
        assert client.post(
            "/auth/register",
            json={"username": "numbers", "password": "12345678"},
        ).status_code == 422

    def test_register_rejects_password_over_bcrypt_byte_limit(self, client):
        password = "가" * 24 + "a1"
        assert len(password) <= 72
        assert len(password.encode("utf-8")) > 72
        assert client.post(
            "/auth/register",
            json={"username": "unicode", "password": password},
        ).status_code == 422


class TestProtectedRoutes:
    def test_missing_token_rejected(self, client):
        resp = client.delete("/users/1")
        assert resp.status_code in (401, 403)

    def test_garbage_token_rejected(self, client):
        resp = client.delete("/users/1", headers={"Authorization": "Bearer not.a.real.token"})
        assert resp.status_code in (401, 403)

    def test_get_users_list_not_publicly_accessible(self, client):
        resp = client.get("/users")
        # Route was deleted — must not return a 200 list of users
        assert resp.status_code != 200


class TestTokenAlgorithmBoundary:
    def test_hs256_token_reaches_protected_route(self, client, auth_headers):
        assert client.get('/game/sessions', headers=auth_headers).status_code == 200

    def test_hs384_with_same_secret_is_rejected(self, client, registered_user):
        token = jwt.encode({'sub': str(registered_user['user_id'])}, SECRET, algorithm='HS384')
        assert client.get('/game/sessions', headers={'Authorization': f'Bearer {token}'}).status_code == 401

    def test_wrong_hs256_key_is_rejected(self, client, registered_user):
        token = jwt.encode({'sub': str(registered_user['user_id'])}, 'wrong-test-secret', algorithm='HS256')
        assert client.get('/game/sessions', headers={'Authorization': f'Bearer {token}'}).status_code == 401

    def test_unsigned_token_is_rejected(self, client, registered_user):
        import base64
        import json
        def encode(value):
            return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=').decode()
        token = f"{encode({'alg': 'none', 'typ': 'JWT'})}.{encode({'sub': str(registered_user['user_id'])})}."
        assert client.get('/game/sessions', headers={'Authorization': f'Bearer {token}'}).status_code == 401


class TestTokenExpiryAndClaims:
    def _get(self, client, token):
        return client.get('/game/sessions', headers={'Authorization': f'Bearer {token}'})

    def test_issued_token_expires_in_seven_days(self, client):
        body = client.post("/auth/register", json={"username": "frank", "password": "pw123456"}).json()
        payload = jwt.decode(body["access_token"], SECRET, algorithms=[ALGORITHM])
        remaining = payload["exp"] - datetime.now(timezone.utc).timestamp()
        assert timedelta(days=7) - timedelta(minutes=1) < timedelta(seconds=remaining) <= timedelta(days=7)

    def test_unexpired_token_reaches_protected_route(self, client, registered_user):
        exp = datetime.now(timezone.utc) + timedelta(minutes=5)
        token = jwt.encode({'sub': str(registered_user['user_id']), 'exp': exp}, SECRET, algorithm=ALGORITHM)
        assert self._get(client, token).status_code == 200

    def test_expired_token_is_rejected(self, client, registered_user):
        exp = datetime.now(timezone.utc) - timedelta(seconds=5)
        token = jwt.encode({'sub': str(registered_user['user_id']), 'exp': exp}, SECRET, algorithm=ALGORITHM)
        resp = self._get(client, token)
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid or expired token"
        assert resp.headers["WWW-Authenticate"] == "Bearer"

    def test_token_without_subject_is_rejected(self, client):
        token = jwt.encode({'username': 'nobody'}, SECRET, algorithm=ALGORITHM)
        assert self._get(client, token).status_code == 401

    def test_tampered_payload_is_rejected(self, client, registered_user):
        token = jwt.encode({'sub': str(registered_user['user_id'])}, SECRET, algorithm=ALGORITHM)
        header, _, signature = token.split('.')
        forged = jwt.encode({'sub': str(registered_user['user_id'] + 1)}, 'other-secret-of-sufficient-length-1234', algorithm=ALGORITHM)
        token = f"{header}.{forged.split('.')[1]}.{signature}"
        assert self._get(client, token).status_code == 401
