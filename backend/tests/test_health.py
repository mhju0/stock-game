"""
/health/db is the keep-alive + readiness endpoint. It must actually touch the
database (SELECT 1) and return 200 on success so an external cron can both wake
Render and keep Supabase from pausing.
"""


class TestHealthDb:
    def test_health_db_returns_ok(self, client):
        resp = client.get("/health/db")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
