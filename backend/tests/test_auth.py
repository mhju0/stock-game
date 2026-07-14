from jose import jwt


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
