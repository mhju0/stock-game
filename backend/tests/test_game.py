class TestGameSessions:
    def test_game_sessions_empty_without_active_game(self, client, registered_user, auth_headers):
        resp = client.get("/game/sessions", headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json() == {"sessions": []}

    def test_game_sessions_returns_active_game_after_start(self, client, registered_user, auth_headers):
        create_resp = client.post(
            "/game/new",
            json={"starting_balance_krw": 1_000_000, "duration_days": 30},
            headers=auth_headers,
        )
        assert create_resp.status_code == 200

        resp = client.get("/game/sessions", headers=auth_headers)

        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert len(sessions) == 1
        assert sessions[0]["status"] == "active"
        assert sessions[0]["starting_balance_krw"] == 1_000_000
        assert sessions[0]["duration_days"] == 30
        assert "current_value_krw" in sessions[0]
        assert "last_updated_at" in sessions[0]
