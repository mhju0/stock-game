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
