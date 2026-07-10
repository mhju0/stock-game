"""
Legacy (non-session) /trade/* paths must never touch session-scoped holdings.

When a user has no active session (e.g. only completed/archived games), the
trade services fall back to the legacy path. The legacy holding lookups must be
scoped to game_session_id IS NULL so a direct legacy trade can never mutate or
sell an ended game's holdings.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.models import GameSession, Holding, User
from app.services.trading_service import buy_stock, sell_stock


def _user(db_session):
    user = User(username="legacy-user", hashed_password="hash",
                balance_krw=10_000_000.0, balance_usd=0.0)
    db_session.add(user)
    db_session.flush()
    return user


def _completed_session(db_session, user):
    now = datetime.now(timezone.utc)
    session = GameSession(
        user_id=user.id, title="Ended", status="completed",
        starting_balance_krw=10_000_000.0, starting_balance_usd=0.0,
        cash_krw=5_000_000.0, cash_usd=0.0, duration_days=90,
        start_date=now - timedelta(days=120), end_date=now - timedelta(days=30),
        is_active=False,
    )
    db_session.add(session)
    db_session.flush()
    return session


def _scoped_holding(db_session, user, session, ticker="005930.KS", qty=10, avg=70000.0):
    holding = Holding(
        user_id=user.id, game_session_id=session.id, ticker=ticker,
        name=ticker, market="KRX", sector="Tech", industry="Semis",
        quantity=qty, avg_price=avg, currency="KRW",
    )
    db_session.add(holding)
    db_session.flush()
    return holding


KRW_INFO = {
    "price": 80000.0, "currency": "KRW", "name": "Samsung",
    "market": "KRX", "sector": "Tech", "industry": "Semis",
}


class TestLegacySellIsolation:
    def test_legacy_sell_cannot_touch_session_scoped_holding(self, db_session):
        user = _user(db_session)
        ended = _completed_session(db_session, user)
        holding = _scoped_holding(db_session, user, ended, qty=10)

        # No active session -> legacy path. Legacy sell must not find the
        # ended game's holding.
        with patch("app.services.trading_service.get_stock_price", return_value=80000.0), \
             patch("app.services.trading_service.get_stock_info", return_value=KRW_INFO):
            with pytest.raises(ValueError, match="don't own"):
                sell_stock(db_session, user_id=user.id, ticker="005930.KS", quantity=5)

        db_session.refresh(holding)
        assert holding.quantity == 10  # untouched
        assert holding.game_session_id == ended.id


class TestLegacyBuyIsolation:
    def test_legacy_buy_cannot_mutate_session_scoped_holding(self, db_session):
        user = _user(db_session)
        ended = _completed_session(db_session, user)
        holding = _scoped_holding(db_session, user, ended, ticker="005930.KS", qty=10, avg=70000.0)

        with patch("app.services.trading_service.get_stock_price", return_value=80000.0), \
             patch("app.services.trading_service.get_stock_info", return_value=KRW_INFO):
            buy_stock(db_session, user_id=user.id, ticker="005930.KS", quantity=3)

        # The ended game's holding must be unchanged...
        db_session.refresh(holding)
        assert holding.quantity == 10
        assert holding.avg_price == 70000.0

        # ...and the legacy buy must have created a separate unscoped holding.
        legacy = (
            db_session.query(Holding)
            .filter(Holding.user_id == user.id,
                    Holding.ticker == "005930.KS",
                    Holding.game_session_id.is_(None))
            .all()
        )
        assert len(legacy) == 1
        assert legacy[0].quantity == 3
