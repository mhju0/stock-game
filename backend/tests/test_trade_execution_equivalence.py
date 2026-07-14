"""Behavioral parity for Legacy and Session Portfolio trade storage.

These tests exercise the public trading-service interface with the real test
database. Market data and snapshot capture are the only mocked system
boundaries.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.models import GameSession, Holding, Transaction, User
from app.services.trading_service import buy_stock, exchange_currency, sell_stock


KRW_STOCK = {
    "price": 1_000.0,
    "currency": "KRW",
    "name": "Test KRW",
    "market": "KRX",
    "sector": "Finance",
    "industry": "Banking",
}


def _create_trade_portfolio(
    db_session,
    *,
    kind: str,
    suffix: str,
    cash_krw: float = 1_000_000.0,
    cash_usd: float = 50.0,
) -> tuple[User, GameSession | None]:
    user = User(
        username=f"trade-{kind}-{suffix}",
        hashed_password="hash",
        balance_krw=cash_krw,
        balance_usd=cash_usd,
    )
    db_session.add(user)
    db_session.flush()

    if kind == "legacy":
        return user, None

    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id,
        title="Trade Equivalence",
        status="active",
        starting_balance_krw=cash_krw,
        starting_balance_usd=cash_usd,
        cash_krw=cash_krw,
        cash_usd=cash_usd,
        duration_days=90,
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=89),
        is_active=True,
    )
    db_session.add(session)
    db_session.flush()
    return user, session


def _create_holding(
    db_session,
    user: User,
    session: GameSession | None,
    *,
    quantity: float = 5,
    avg_price: float = 1_000.0,
) -> Holding:
    holding = Holding(
        user_id=user.id,
        game_session_id=session.id if session else None,
        ticker="KB",
        name="Test KRW",
        market="KRX",
        sector="Finance",
        industry="Banking",
        quantity=quantity,
        avg_price=avg_price,
        currency="KRW",
    )
    db_session.add(holding)
    db_session.flush()
    return holding


def _normalized_response(response: dict) -> dict:
    return {key: value for key, value in response.items() if key != "session_id"}


def _holding_result(db_session, user: User, session: GameSession | None) -> dict:
    holding = (
        db_session.query(Holding)
        .filter(
            Holding.user_id == user.id,
            Holding.game_session_id == (session.id if session else None),
            Holding.ticker == "KB",
        )
        .one()
    )
    return {
        "ticker": holding.ticker,
        "name": holding.name,
        "market": holding.market,
        "sector": holding.sector,
        "industry": holding.industry,
        "quantity": holding.quantity,
        "avg_price": holding.avg_price,
        "currency": holding.currency,
    }


def _transaction_result(
    db_session,
    user: User,
    session: GameSession | None,
    transaction_type: str,
) -> dict:
    transaction = (
        db_session.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.game_session_id == (session.id if session else None),
            Transaction.transaction_type == transaction_type,
        )
        .one()
    )
    return {
        "ticker": transaction.ticker,
        "name": transaction.name,
        "market": transaction.market,
        "transaction_type": transaction.transaction_type,
        "quantity": transaction.quantity,
        "price": transaction.price,
        "currency": transaction.currency,
        "sector": transaction.sector,
        "industry": transaction.industry,
        "total_amount": transaction.total_amount,
        "realized_pnl": transaction.realized_pnl,
    }


def _call_for_both_storage_kinds(db_session, operation):
    results = {}
    portfolios = {}
    for kind in ("legacy", "session"):
        user, session = _create_trade_portfolio(
            db_session,
            kind=kind,
            suffix=operation.__name__,
        )
        portfolios[kind] = (user, session)
        results[kind] = operation(user, session)
    return results, portfolios


class TestTradeExecutionEquivalence:
    def test_buy_has_equivalent_balance_holding_and_transaction_results(self, db_session):
        def execute(user, session):
            _create_holding(
                db_session,
                user,
                session,
                quantity=3,
                avg_price=800.0,
            )
            return buy_stock(
                db_session,
                user_id=user.id,
                ticker="KB",
                quantity=2,
                game_session_id=session.id if session else None,
            )

        with patch("app.services.trading_service.get_stock_info", return_value=KRW_STOCK), \
             patch("app.services.trading_service.take_snapshot"), \
             patch("app.services.trading_service.take_session_snapshot"):
            responses, portfolios = _call_for_both_storage_kinds(db_session, execute)

        expected_response = {
            "status": "success",
            "transaction": {
                "type": "BUY",
                "ticker": "KB",
                "name": "Test KRW",
                "quantity": 2,
                "price": 1_000.0,
                "total_cost": 2_000.0,
                "currency": "KRW",
            },
            "balance": {"krw": 998_000.0, "usd": 50.0},
        }
        expected_holding = {
            "ticker": "KB",
            "name": "Test KRW",
            "market": "KRX",
            "sector": "Finance",
            "industry": "Banking",
            "quantity": 5,
            "avg_price": 880.0,
            "currency": "KRW",
        }
        expected_transaction = {
            "ticker": "KB",
            "name": "Test KRW",
            "market": "KRX",
            "transaction_type": "BUY",
            "quantity": 2,
            "price": 1_000.0,
            "currency": "KRW",
            "sector": "Finance",
            "industry": "Banking",
            "total_amount": 2_000.0,
            "realized_pnl": 0.0,
        }

        for kind, response in responses.items():
            user, session = portfolios[kind]
            assert _normalized_response(response) == expected_response
            assert _holding_result(db_session, user, session) == expected_holding
            assert _transaction_result(db_session, user, session, "BUY") == expected_transaction

    def test_sell_has_equivalent_balance_holding_and_transaction_results(self, db_session):
        def execute(user, session):
            _create_holding(db_session, user, session)
            return sell_stock(
                db_session,
                user_id=user.id,
                ticker="KB",
                quantity=2,
                game_session_id=session.id if session else None,
            )

        with patch("app.services.trading_service.get_stock_price", return_value=1_200.0), \
             patch("app.services.trading_service.take_snapshot"), \
             patch("app.services.trading_service.take_session_snapshot"):
            responses, portfolios = _call_for_both_storage_kinds(db_session, execute)

        expected_response = {
            "status": "success",
            "transaction": {
                "type": "SELL",
                "ticker": "KB",
                "name": "Test KRW",
                "quantity": 2,
                "price": 1_200.0,
                "total_proceeds": 2_400.0,
                "currency": "KRW",
                "realized_pnl": 400.0,
            },
            "balance": {"krw": 1_002_400.0, "usd": 50.0},
        }
        expected_holding = {
            "ticker": "KB",
            "name": "Test KRW",
            "market": "KRX",
            "sector": "Finance",
            "industry": "Banking",
            "quantity": 3,
            "avg_price": 1_000.0,
            "currency": "KRW",
        }
        expected_transaction = {
            "ticker": "KB",
            "name": "Test KRW",
            "market": "KRX",
            "transaction_type": "SELL",
            "quantity": 2,
            "price": 1_200.0,
            "currency": "KRW",
            "sector": "Finance",
            "industry": "Banking",
            "total_amount": 2_400.0,
            "realized_pnl": 400.0,
        }

        for kind, response in responses.items():
            user, session = portfolios[kind]
            assert _normalized_response(response) == expected_response
            assert _holding_result(db_session, user, session) == expected_holding
            assert _transaction_result(db_session, user, session, "SELL") == expected_transaction

    def test_exchange_has_equivalent_balance_and_transaction_results(self, db_session):
        def execute(user, session):
            return exchange_currency(
                db_session,
                user_id=user.id,
                from_currency="KRW",
                to_currency="USD",
                amount=130_000,
                game_session_id=session.id if session else None,
            )

        with patch("app.services.trading_service.get_exchange_rate", return_value=1_300.0), \
             patch("app.services.trading_service.take_snapshot"), \
             patch("app.services.trading_service.take_session_snapshot"):
            responses, portfolios = _call_for_both_storage_kinds(db_session, execute)

        expected_response = {
            "status": "success",
            "exchange": {
                "from": "KRW",
                "to": "USD",
                "amount": 130_000,
                "converted": 100.0,
                "rate": 1_300.0,
            },
            "balance": {"krw": 870_000.0, "usd": 150.0},
        }
        expected_transaction = {
            "ticker": "KRW/USD",
            "name": "Currency Exchange",
            "market": "FX",
            "transaction_type": "EXCHANGE",
            "quantity": 1,
            "price": 1_300.0,
            "currency": "KRW",
            "sector": "Currency",
            "industry": "Foreign Exchange",
            "total_amount": 130_000,
            "realized_pnl": 0.0,
        }

        for kind, response in responses.items():
            user, session = portfolios[kind]
            assert _normalized_response(response) == expected_response
            assert _transaction_result(db_session, user, session, "EXCHANGE") == expected_transaction

    @pytest.mark.parametrize(
        ("operation", "expected_error"),
        [
            ("buy", "Insufficient KRW balance. Need ₩1,000, have ₩500"),
            ("sell", "Not enough shares of Test KRW. Own 1.0, trying to sell 2"),
            ("exchange", "Insufficient KRW. Have ₩500"),
        ],
    )
    def test_rejections_have_equivalent_error_messages(self, db_session, operation, expected_error):
        errors = {}
        for kind in ("legacy", "session"):
            user, session = _create_trade_portfolio(
                db_session,
                kind=kind,
                suffix=f"{operation}-error",
                cash_krw=500,
            )
            if operation == "sell":
                _create_holding(db_session, user, session, quantity=1)

            with patch("app.services.trading_service.get_stock_info", return_value=KRW_STOCK), \
                 patch("app.services.trading_service.get_stock_price", return_value=1_200.0), \
                 patch("app.services.trading_service.get_exchange_rate", return_value=1_300.0):
                with pytest.raises(ValueError) as exc_info:
                    if operation == "buy":
                        buy_stock(
                            db_session,
                            user_id=user.id,
                            ticker="KB",
                            quantity=1,
                            game_session_id=session.id if session else None,
                        )
                    elif operation == "sell":
                        sell_stock(
                            db_session,
                            user_id=user.id,
                            ticker="KB",
                            quantity=2,
                            game_session_id=session.id if session else None,
                        )
                    else:
                        exchange_currency(
                            db_session,
                            user_id=user.id,
                            from_currency="KRW",
                            to_currency="USD",
                            amount=1_000,
                            game_session_id=session.id if session else None,
                        )
            errors[kind] = str(exc_info.value)

        assert errors == {"legacy": expected_error, "session": expected_error}


@pytest.mark.parametrize("kind", ["legacy", "session"])
@pytest.mark.parametrize("operation", ["buy", "sell", "exchange"])
def test_snapshot_failure_does_not_undo_committed_trade(
    db_session,
    kind,
    operation,
):
    user, session = _create_trade_portfolio(
        db_session,
        kind=kind,
        suffix=f"snapshot-{operation}",
    )
    if operation == "sell":
        _create_holding(db_session, user, session)

    with patch("app.services.trading_service.get_stock_info", return_value=KRW_STOCK), \
         patch("app.services.trading_service.get_stock_price", return_value=1_200.0), \
         patch("app.services.trading_service.get_exchange_rate", return_value=1_300.0), \
         patch("app.services.trading_service.take_snapshot", side_effect=RuntimeError("snapshot failed")), \
         patch("app.services.trading_service.take_session_snapshot", side_effect=RuntimeError("snapshot failed")):
        if operation == "buy":
            response = buy_stock(
                db_session,
                user_id=user.id,
                ticker="KB",
                quantity=2,
                game_session_id=session.id if session else None,
            )
            expected_cash_krw = 998_000.0
            expected_holding_quantity = 2
            transaction_type = "BUY"
        elif operation == "sell":
            response = sell_stock(
                db_session,
                user_id=user.id,
                ticker="KB",
                quantity=2,
                game_session_id=session.id if session else None,
            )
            expected_cash_krw = 1_002_400.0
            expected_holding_quantity = 3
            transaction_type = "SELL"
        else:
            response = exchange_currency(
                db_session,
                user_id=user.id,
                from_currency="KRW",
                to_currency="USD",
                amount=130_000,
                game_session_id=session.id if session else None,
            )
            expected_cash_krw = 870_000.0
            expected_holding_quantity = None
            transaction_type = "EXCHANGE"

    assert response["status"] == "success"
    db_session.refresh(user)
    if session:
        db_session.refresh(session)
        assert session.cash_krw == expected_cash_krw
        assert user.balance_krw == session.cash_krw
    else:
        assert user.balance_krw == expected_cash_krw

    if expected_holding_quantity is not None:
        assert _holding_result(db_session, user, session)["quantity"] == expected_holding_quantity
    assert _transaction_result(db_session, user, session, transaction_type)["transaction_type"] == transaction_type
