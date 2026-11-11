"""A resent order must not execute twice.

The client sends one Idempotency-Key per order and reuses it when it resends
that order. These tests fail the post-trade snapshot on purpose: that is the
situation in which a client is most likely to resend.
"""

from unittest.mock import patch

import pytest

from app.models import Holding, Transaction, User
from app.services.trading_service import buy_stock
from tests.test_trading import (
    create_game_session,
    create_session_holding,
    current_user,
    krw_stock,
)

KEY = "3f0c2a52-7a55-4a0e-9d4e-0c5b1a2f9e11"
OTHER_KEY = "9b1d6c1e-2f4a-4c57-8a3e-6d2e5f7a1b22"


@pytest.fixture
def failing_snapshot():
    with patch("app.services.trading_service.get_stock_info", return_value=krw_stock(1000.0)), \
         patch("app.services.trading_service.get_stock_price", return_value=1200.0), \
         patch("app.services.trading_service.take_snapshot", side_effect=RuntimeError("snapshot failed")), \
         patch("app.services.trading_service.take_session_snapshot", side_effect=RuntimeError("snapshot failed")):
        yield


def _post(client, path, headers, key=None, quantity=2):
    if key is not None:
        headers = {**headers, "Idempotency-Key": key}
    return client.post(path, json={"ticker": "KB", "quantity": quantity}, headers=headers)


def _transactions(db_session, session_id):
    return db_session.query(Transaction).filter_by(game_session_id=session_id).all()


def test_resent_session_buy_executes_once(client, db_session, registered_user, auth_headers, failing_snapshot):
    session = create_game_session(db_session, current_user(db_session, registered_user), cash_krw=1_000_000)
    path = f"/game/sessions/{session.id}/trade/buy"

    first = _post(client, path, auth_headers, KEY)
    second = _post(client, path, auth_headers, KEY)

    assert first.status_code == 200 and second.status_code == 200
    assert "replayed" not in first.json()
    assert second.json() == {**first.json(), "replayed": True}
    db_session.refresh(session)
    assert len(_transactions(db_session, session.id)) == 1
    assert session.cash_krw == 998_000
    assert db_session.query(Holding).filter_by(game_session_id=session.id).one().quantity == 2


def test_resent_session_sell_executes_once(client, db_session, registered_user, auth_headers, failing_snapshot):
    user = current_user(db_session, registered_user)
    session = create_game_session(db_session, user, cash_krw=1_000_000)
    create_session_holding(db_session, user, session, quantity=5, avg_price=1000.0)
    path = f"/game/sessions/{session.id}/trade/sell"

    first = _post(client, path, auth_headers, KEY)
    second = _post(client, path, auth_headers, KEY)

    assert first.status_code == 200 and second.status_code == 200
    assert second.json() == {**first.json(), "replayed": True}
    assert second.json()["transaction"]["realized_pnl"] == 400.0
    db_session.refresh(session)
    assert len(_transactions(db_session, session.id)) == 1
    assert session.cash_krw == 1_002_400
    assert db_session.query(Holding).filter_by(game_session_id=session.id).one().quantity == 3


def test_resent_legacy_buy_executes_once(client, db_session, registered_user, auth_headers, failing_snapshot):
    first = _post(client, "/trade/buy", auth_headers, KEY)
    second = _post(client, "/trade/buy", auth_headers, KEY)

    assert first.status_code == 200 and second.status_code == 200
    assert second.json() == {**first.json(), "replayed": True}
    assert db_session.query(Transaction).count() == 1
    assert current_user(db_session, registered_user).balance_krw == 9_998_000


def test_replay_does_not_need_a_fresh_quote(client, db_session, registered_user, auth_headers, failing_snapshot):
    session = create_game_session(db_session, current_user(db_session, registered_user), cash_krw=1_000_000)
    path = f"/game/sessions/{session.id}/trade/buy"
    first = _post(client, path, auth_headers, KEY)

    with patch("app.services.trading_service.get_stock_info", return_value=None):
        second = _post(client, path, auth_headers, KEY)

    assert second.status_code == 200
    assert second.json() == {**first.json(), "replayed": True}


def test_different_keys_are_separate_orders(client, db_session, registered_user, auth_headers, failing_snapshot):
    session = create_game_session(db_session, current_user(db_session, registered_user), cash_krw=1_000_000)
    path = f"/game/sessions/{session.id}/trade/buy"

    assert _post(client, path, auth_headers, KEY).status_code == 200
    assert _post(client, path, auth_headers, OTHER_KEY).status_code == 200

    assert len(_transactions(db_session, session.id)) == 2


def test_key_reused_for_a_different_order_is_rejected(client, db_session, registered_user, auth_headers, failing_snapshot):
    session = create_game_session(db_session, current_user(db_session, registered_user), cash_krw=1_000_000)
    path = f"/game/sessions/{session.id}/trade/buy"
    assert _post(client, path, auth_headers, KEY, quantity=2).status_code == 200

    reused = _post(client, path, auth_headers, KEY, quantity=3)

    assert reused.status_code == 400
    assert "Idempotency-Key" in reused.json()["detail"]
    db_session.refresh(session)
    assert len(_transactions(db_session, session.id)) == 1
    assert session.cash_krw == 998_000


@pytest.mark.parametrize("key", ["short", "x" * 65, "has space in it", "semi;colon-key"])
def test_malformed_key_is_rejected_before_trading(client, db_session, registered_user, auth_headers, failing_snapshot, key):
    session = create_game_session(db_session, current_user(db_session, registered_user), cash_krw=1_000_000)

    response = _post(client, f"/game/sessions/{session.id}/trade/buy", auth_headers, key)

    assert response.status_code == 422
    assert _transactions(db_session, session.id) == []


def test_keys_are_scoped_to_the_account(db_session, registered_user, test_password_hash, failing_snapshot):
    other = User(username="otheruser", hashed_password=test_password_hash)
    db_session.add(other)
    db_session.commit()

    for user_id in (registered_user["user_id"], other.id):
        response = buy_stock(db_session, user_id=user_id, ticker="KB", quantity=2, client_request_id=KEY)
        assert "replayed" not in response

    assert db_session.query(Transaction).count() == 2
