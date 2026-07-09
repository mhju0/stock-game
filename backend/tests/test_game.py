from datetime import datetime, timedelta, timezone

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User, Watchlist


def current_user(db_session, registered_user):
    return db_session.query(User).filter(User.id == registered_user["user_id"]).first()


def create_session(
    db_session,
    user,
    *,
    title="Session",
    status="active",
    is_active=True,
    cash_krw=1_000_000,
    cash_usd=0.0,
    starting_balance_krw=1_000_000,
    starting_balance_usd=0.0,
    start_offset_days=0,
):
    now = datetime.now(timezone.utc)
    start_date = now + timedelta(days=start_offset_days)
    session = GameSession(
        user_id=user.id,
        title=title,
        status=status,
        starting_balance_krw=starting_balance_krw,
        starting_balance_usd=starting_balance_usd,
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        duration_days=90,
        start_date=start_date,
        end_date=start_date + timedelta(days=90),
        is_active=is_active,
    )
    db_session.add(session)
    db_session.flush()
    return session


def create_scoped_data(db_session, user, session):
    holding = Holding(
        user_id=user.id,
        game_session_id=session.id,
        ticker="KB",
        name="KB Corp",
        market="KRX",
        sector="Finance",
        industry="Banking",
        quantity=2,
        avg_price=1000.0,
        currency="KRW",
    )
    tx = Transaction(
        user_id=user.id,
        game_session_id=session.id,
        ticker="KB",
        name="KB Corp",
        market="KRX",
        transaction_type="BUY",
        quantity=2,
        price=1000.0,
        currency="KRW",
        sector="Finance",
        industry="Banking",
        total_amount=2000.0,
    )
    snapshot = PortfolioSnapshot(
        user_id=user.id,
        game_session_id=session.id,
        total_value_krw=1_002_000,
        total_holdings_value_krw=2000.0,
        cash_krw=1_000_000,
        cash_usd=0.0,
        exchange_rate=1300.0,
    )
    watchlist = Watchlist(user_id=user.id, ticker="KB", name="KB Corp", market="KRX")
    db_session.add_all([holding, tx, snapshot, watchlist])
    db_session.flush()
    return holding, tx, snapshot, watchlist


class TestGameSessions:
    def test_game_sessions_empty_without_any_game(
        self,
        client,
        registered_user,
        auth_headers,
    ):
        resp = client.get("/game/sessions", headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json() == {"sessions": []}

    def test_game_sessions_returns_game_after_legacy_start(
        self,
        client,
        registered_user,
        auth_headers,
    ):
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
        assert sessions[0]["title"] == "Trading Simulation"
        assert sessions[0]["starting_balance_krw"] == 1_000_000
        assert sessions[0]["cash_krw"] == 1_000_000
        assert sessions[0]["duration_days"] == 30
        assert "current_value_krw" in sessions[0]
        assert "last_updated_at" in sessions[0]

    def test_game_sessions_default_lists_playable_active_owned_sessions_only(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        create_session(db_session, user, title="Active", start_offset_days=1)
        create_session(
            db_session,
            user,
            title="Completed",
            status="completed",
            is_active=False,
            start_offset_days=-10,
        )
        create_session(
            db_session,
            user,
            title="Archived",
            status="archived",
            is_active=False,
            start_offset_days=-20,
        )
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        create_session(db_session, other, title="Other")

        resp = client.get("/game/sessions", headers=auth_headers)

        assert resp.status_code == 200
        titles = [session["title"] for session in resp.json()["sessions"]]
        assert titles == ["Active"]

    def test_game_sessions_include_all_lists_all_owned_sessions(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        create_session(db_session, user, title="Active", start_offset_days=1)
        create_session(
            db_session,
            user,
            title="Completed",
            status="completed",
            is_active=False,
            start_offset_days=-10,
        )
        create_session(
            db_session,
            user,
            title="Archived",
            status="archived",
            is_active=False,
            start_offset_days=-20,
        )
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        create_session(db_session, other, title="Other")

        resp = client.get("/game/sessions?include_all=true", headers=auth_headers)

        assert resp.status_code == 200
        titles = [session["title"] for session in resp.json()["sessions"]]
        assert titles == ["Active", "Completed", "Archived"]

    def test_game_sessions_include_completed_alias_lists_all_owned_sessions(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        create_session(db_session, user, title="Active", start_offset_days=1)
        create_session(
            db_session,
            user,
            title="Completed",
            status="completed",
            is_active=False,
            start_offset_days=-10,
        )

        resp = client.get("/game/sessions?include_completed=true", headers=auth_headers)

        assert resp.status_code == 200
        titles = [session["title"] for session in resp.json()["sessions"]]
        assert titles == ["Active", "Completed"]

    def test_post_game_sessions_creates_independent_session_without_deleting_data(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        old_session = create_session(db_session, user, title="Old")
        create_scoped_data(db_session, user, old_session)

        resp = client.post(
            "/game/sessions",
            json={
                "title": "New Session",
                "duration_days": 45,
                "starting_balance_krw": 5_000_000,
                "starting_balance_usd": 12.5,
            },
            headers=auth_headers,
        )

        assert resp.status_code == 200
        body = resp.json()["session"]
        assert body["title"] == "New Session"
        assert body["duration_days"] == 45
        assert body["starting_balance_krw"] == 5_000_000
        assert body["starting_balance_usd"] == 12.5
        assert body["cash_krw"] == 5_000_000
        assert body["cash_usd"] == 12.5
        assert db_session.query(Holding).filter_by(game_session_id=old_session.id).count() == 1
        assert db_session.query(Transaction).filter_by(game_session_id=old_session.id).count() == 1
        assert (
            db_session.query(PortfolioSnapshot)
            .filter_by(game_session_id=old_session.id)
            .count()
            == 1
        )
        assert db_session.query(Watchlist).filter_by(user_id=user.id).count() == 1

    def test_multiple_active_sessions_are_allowed(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        create_session(db_session, user, title="First", start_offset_days=-1)

        resp = client.post(
            "/game/sessions",
            json={"title": "Second", "starting_balance_krw": 2_000_000},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        active_sessions = (
            db_session.query(GameSession)
            .filter(GameSession.user_id == user.id, GameSession.status == "active")
            .all()
        )
        assert len(active_sessions) == 2
        assert all(session.is_active for session in active_sessions)

    def test_game_new_compatibility_no_longer_deletes_existing_data(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        old_session = create_session(db_session, user, title="Old")
        create_scoped_data(db_session, user, old_session)

        resp = client.post(
            "/game/new",
            json={"starting_balance_krw": 3_000_000, "duration_days": 60},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        body = resp.json()["session"]
        assert body["title"] == "Trading Simulation"
        assert body["starting_balance_krw"] == 3_000_000
        assert body["duration_days"] == 60
        assert db_session.query(Holding).filter_by(game_session_id=old_session.id).count() == 1
        assert db_session.query(Transaction).filter_by(game_session_id=old_session.id).count() == 1
        assert (
            db_session.query(PortfolioSnapshot)
            .filter_by(game_session_id=old_session.id)
            .count()
            == 1
        )
        assert db_session.query(Watchlist).filter_by(user_id=user.id).count() == 1

    def test_get_game_session_cross_user_returns_404(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other)

        resp = client.get(f"/game/sessions/{other_session.id}", headers=auth_headers)

        assert resp.status_code == 404

    def test_user_can_archive_own_session(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session = create_session(db_session, user, title="Archive Me")

        resp = client.patch(
            f"/game/sessions/{session.id}",
            json={"status": "archived"},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        body = resp.json()["session"]
        assert body["status"] == "archived"
        assert body["is_active"] is False
        db_session.refresh(session)
        assert session.status == "archived"
        assert session.is_active is False
        assert session.completed_at is not None

    def test_user_can_rename_own_session(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session = create_session(db_session, user, title="Old Name")

        resp = client.patch(
            f"/game/sessions/{session.id}",
            json={"title": "New Name"},
            headers=auth_headers,
        )

        assert resp.status_code == 200
        assert resp.json()["session"]["title"] == "New Name"
        db_session.refresh(session)
        assert session.title == "New Name"

    def test_cross_user_archive_returns_404(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other)

        resp = client.patch(
            f"/game/sessions/{other_session.id}",
            json={"status": "archived"},
            headers=auth_headers,
        )

        assert resp.status_code == 404

    def test_user_can_delete_own_session(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session = create_session(db_session, user, title="Delete Me")
        create_scoped_data(db_session, user, session)

        resp = client.delete(f"/game/sessions/{session.id}", headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json()["deleted_session_id"] == session.id
        assert db_session.query(GameSession).filter_by(id=session.id).count() == 0

    def test_delete_removes_only_selected_session_scoped_data_and_keeps_watchlist(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        deleted_session = create_session(db_session, user, title="Delete")
        kept_session = create_session(db_session, user, title="Keep")
        create_scoped_data(db_session, user, deleted_session)
        create_scoped_data(db_session, user, kept_session)

        resp = client.delete(f"/game/sessions/{deleted_session.id}", headers=auth_headers)

        assert resp.status_code == 200
        assert db_session.query(Holding).filter_by(game_session_id=deleted_session.id).count() == 0
        assert db_session.query(Transaction).filter_by(game_session_id=deleted_session.id).count() == 0
        assert (
            db_session.query(PortfolioSnapshot)
            .filter_by(game_session_id=deleted_session.id)
            .count()
            == 0
        )
        assert db_session.query(Holding).filter_by(game_session_id=kept_session.id).count() == 1
        assert db_session.query(Transaction).filter_by(game_session_id=kept_session.id).count() == 1
        assert (
            db_session.query(PortfolioSnapshot)
            .filter_by(game_session_id=kept_session.id)
            .count()
            == 1
        )
        assert db_session.query(Watchlist).filter_by(user_id=user.id).count() == 2

    def test_delete_does_not_remove_other_users_session_data(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        own_session = create_session(db_session, user, title="Delete")
        create_scoped_data(db_session, user, own_session)
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other, title="Other")
        create_scoped_data(db_session, other, other_session)

        resp = client.delete(f"/game/sessions/{own_session.id}", headers=auth_headers)

        assert resp.status_code == 200
        assert db_session.query(GameSession).filter_by(id=other_session.id).count() == 1
        assert db_session.query(Holding).filter_by(game_session_id=other_session.id).count() == 1
        assert db_session.query(Transaction).filter_by(game_session_id=other_session.id).count() == 1
        assert (
            db_session.query(PortfolioSnapshot)
            .filter_by(game_session_id=other_session.id)
            .count()
            == 1
        )

    def test_cross_user_delete_returns_404(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        other = User(username="other", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other)

        resp = client.delete(f"/game/sessions/{other_session.id}", headers=auth_headers)

        assert resp.status_code == 404

    def test_list_sessions_after_archive_and_delete_behaves_correctly(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        active_session = create_session(db_session, user, title="Active", start_offset_days=1)
        archived_session = create_session(db_session, user, title="Archive", start_offset_days=-1)
        deleted_session = create_session(db_session, user, title="Delete", start_offset_days=-2)

        archive_resp = client.patch(
            f"/game/sessions/{archived_session.id}",
            json={"status": "archived"},
            headers=auth_headers,
        )
        delete_resp = client.delete(f"/game/sessions/{deleted_session.id}", headers=auth_headers)

        assert archive_resp.status_code == 200
        assert delete_resp.status_code == 200

        active_resp = client.get("/game/sessions", headers=auth_headers)
        all_resp = client.get("/game/sessions?include_all=true", headers=auth_headers)

        assert [s["id"] for s in active_resp.json()["sessions"]] == [active_session.id]
        all_sessions = all_resp.json()["sessions"]
        all_ids = [s["id"] for s in all_sessions]
        assert active_session.id in all_ids
        assert archived_session.id in all_ids
        assert deleted_session.id not in all_ids
        archived = next(s for s in all_sessions if s["id"] == archived_session.id)
        assert archived["status"] == "archived"

    def test_title_duration_and_starting_cash_fields_are_persisted(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)

        resp = client.post(
            "/game/sessions",
            json={
                "title": "Growth Challenge",
                "duration_days": 120,
                "starting_balance_krw": 7_000_000,
                "starting_balance_usd": 25.0,
            },
            headers=auth_headers,
        )

        assert resp.status_code == 200
        session_id = resp.json()["session"]["id"]
        session = db_session.query(GameSession).filter_by(id=session_id).one()
        db_session.refresh(user)
        assert session.title == "Growth Challenge"
        assert session.duration_days == 120
        assert session.starting_balance_krw == 7_000_000
        assert session.starting_balance_usd == 25.0
        assert session.cash_krw == 7_000_000
        assert session.cash_usd == 25.0
        assert user.balance_krw == 7_000_000
        assert user.balance_usd == 25.0

    def test_explicit_session_status_uses_selected_session(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session_a = create_session(db_session, user, title="A", cash_krw=1_000_000)
        session_b = create_session(db_session, user, title="B", cash_krw=2_000_000)

        resp = client.get(f"/game/sessions/{session_b.id}/status", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"] == session_b.id
        assert body["title"] == "B"
        assert body["cash_krw"] == 2_000_000
        assert body["session_id"] != session_a.id

    def test_game_session_result_uses_session_snapshots_and_scoped_data(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session = create_session(
            db_session,
            user,
            title="Finished",
            status="completed",
            is_active=False,
            cash_krw=820_000,
            starting_balance_krw=900_000,
        )
        other_session = create_session(
            db_session,
            user,
            title="Other",
            status="completed",
            is_active=False,
            cash_krw=1_000_000,
        )
        created_at = datetime.now(timezone.utc)
        db_session.add_all(
            [
                PortfolioSnapshot(
                    user_id=user.id,
                    game_session_id=session.id,
                    total_value_krw=1_000_000,
                    total_holdings_value_krw=0,
                    cash_krw=1_000_000,
                    cash_usd=0,
                    exchange_rate=1300,
                    created_at=created_at,
                ),
                PortfolioSnapshot(
                    user_id=user.id,
                    game_session_id=session.id,
                    total_value_krw=1_120_000,
                    total_holdings_value_krw=300_000,
                    cash_krw=820_000,
                    cash_usd=0,
                    exchange_rate=1300,
                    created_at=created_at + timedelta(days=3),
                ),
                Holding(
                    user_id=user.id,
                    game_session_id=session.id,
                    ticker="AAA",
                    name="AAA Corp",
                    market="KRX",
                    sector="Technology",
                    industry="Software",
                    quantity=3,
                    avg_price=100_000,
                    currency="KRW",
                ),
                Transaction(
                    user_id=user.id,
                    game_session_id=session.id,
                    ticker="AAA",
                    name="AAA Corp",
                    market="KRX",
                    transaction_type="BUY",
                    quantity=4,
                    price=100_000,
                    currency="KRW",
                    sector="Technology",
                    industry="Software",
                    total_amount=400_000,
                    created_at=created_at,
                ),
                Transaction(
                    user_id=user.id,
                    game_session_id=session.id,
                    ticker="AAA",
                    name="AAA Corp",
                    market="KRX",
                    transaction_type="SELL",
                    quantity=1,
                    price=150_000,
                    currency="KRW",
                    sector="Technology",
                    industry="Software",
                    total_amount=150_000,
                    realized_pnl=50_000,
                    created_at=created_at + timedelta(days=1),
                ),
                Transaction(
                    user_id=user.id,
                    game_session_id=session.id,
                    ticker="KRW/USD",
                    name="Currency Exchange",
                    market="FX",
                    transaction_type="EXCHANGE",
                    quantity=1,
                    price=1300,
                    currency="KRW",
                    sector="Currency",
                    industry="Foreign Exchange",
                    total_amount=130_000,
                    realized_pnl=0,
                    created_at=created_at + timedelta(days=2),
                ),
                Transaction(
                    user_id=user.id,
                    game_session_id=other_session.id,
                    ticker="BBB",
                    name="BBB Corp",
                    market="KRX",
                    transaction_type="SELL",
                    quantity=1,
                    price=1,
                    currency="KRW",
                    total_amount=1,
                    realized_pnl=999_999,
                ),
            ]
        )
        db_session.commit()

        resp = client.get(f"/game/sessions/{session.id}/result", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.json()
        assert body["session_id"] == session.id
        assert body["status"] == "completed"
        assert body["starting_value_krw"] == 1_000_000
        assert body["starting_value_source"] == "first_snapshot"
        assert body["ending_value_krw"] == 1_120_000
        assert body["ending_value_source"] == "last_snapshot"
        assert body["total_return_krw"] == 120_000
        assert body["total_return_pct"] == 12
        assert body["final_cash_krw"] == 820_000
        assert body["final_cash_usd"] == 0
        assert body["trade_count"] == 2
        assert body["buy_count"] == 1
        assert body["sell_count"] == 1
        assert body["exchange_count"] == 1
        assert body["realized_pnl"] == {
            "available": True,
            "by_currency": {"KRW": 50_000},
        }
        assert body["best_stock"]["ticker"] == "AAA"
        assert body["best_stock"]["realized_pnl"] == 50_000
        assert body["worst_stock"]["ticker"] == "AAA"
        assert body["final_holdings"] == [
            {
                "ticker": "AAA",
                "name": "AAA Corp",
                "market": "KRX",
                "sector": "Technology",
                "industry": "Software",
                "quantity": 3,
                "avg_price": 100_000,
                "currency": "KRW",
                "book_cost": 300_000,
            }
        ]
        assert body["snapshot_count"] == 2
        assert body["peak_value_krw"] == 1_120_000
        assert body["trough_value_krw"] == 1_000_000

    def test_game_session_result_without_snapshots_does_not_invent_ending_value(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        user = current_user(db_session, registered_user)
        session = create_session(
            db_session,
            user,
            title="Missing Snapshot",
            status="completed",
            is_active=False,
        )
        db_session.add(
            Transaction(
                user_id=user.id,
                game_session_id=session.id,
                ticker="AAA",
                name="AAA Corp",
                market="KRX",
                transaction_type="BUY",
                quantity=1,
                price=100_000,
                currency="KRW",
                total_amount=100_000,
            )
        )
        db_session.commit()

        resp = client.get(f"/game/sessions/{session.id}/result", headers=auth_headers)

        assert resp.status_code == 200
        body = resp.json()
        assert body["starting_value_source"] == "session_starting_balance"
        assert body["ending_value_krw"] is None
        assert body["total_return_krw"] is None
        assert body["total_return_pct"] is None
        assert body["return_available"] is False
        assert body["result_data_available"] is False

    def test_game_session_result_cross_user_returns_404(
        self,
        client,
        db_session,
        registered_user,
        auth_headers,
    ):
        other = User(username="other_result", hashed_password="hash", balance_krw=1_000_000)
        db_session.add(other)
        db_session.flush()
        other_session = create_session(db_session, other, title="Other")

        resp = client.get(f"/game/sessions/{other_session.id}/result", headers=auth_headers)

        assert resp.status_code == 404
