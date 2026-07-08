class TestDevFundControls:
    def test_dev_fund_endpoints_hidden_by_default(self, client, registered_user, auth_headers, monkeypatch):
        monkeypatch.delenv("ENABLE_DEV_TOOLS", raising=False)

        add_resp = client.post(
            "/admin/add-funds",
            json={"currency": "KRW", "amount": 1000},
            headers=auth_headers,
        )
        remove_resp = client.post(
            "/admin/remove-funds",
            json={"currency": "KRW", "amount": 1000},
            headers=auth_headers,
        )

        assert add_resp.status_code == 404
        assert remove_resp.status_code == 404

    def test_dev_fund_endpoints_work_when_enabled(self, client, registered_user, auth_headers, monkeypatch):
        monkeypatch.setenv("ENABLE_DEV_TOOLS", "true")
        monkeypatch.setattr("app.routes.admin.get_exchange_rate", lambda: 1300.0)

        add_resp = client.post(
            "/admin/add-funds",
            json={"currency": "KRW", "amount": 1000},
            headers=auth_headers,
        )
        remove_resp = client.post(
            "/admin/remove-funds",
            json={"currency": "KRW", "amount": 500},
            headers=auth_headers,
        )

        assert add_resp.status_code == 200
        assert add_resp.json()["balance"]["krw"] == 10_001_000
        assert remove_resp.status_code == 200
        assert remove_resp.json()["balance"]["krw"] == 10_000_500
