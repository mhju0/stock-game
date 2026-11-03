from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User
from app.services import game_session_service
from app.services.trading_service import buy_stock, exchange_currency, sell_stock


@pytest.mark.parametrize('operation', ['sell', 'exchange', 'buy'])
@pytest.mark.parametrize('nullable_cash', [False, True])
def test_quote_returning_after_expiry_cannot_commit(operation, nullable_cash, db_session, monkeypatch):
    start = datetime(2026, 11, 4, tzinfo=timezone.utc)
    clock = {'now': start}
    monkeypatch.setattr(game_session_service, 'datetime', SimpleNamespace(now=lambda _: clock['now']))
    user = User(username='expiry-audit', balance_krw=130000, balance_usd=100)
    db_session.add(user)
    db_session.flush()
    session = GameSession(user_id=user.id, title='Expiry', status='active', is_active=True,
                          cash_krw=None if nullable_cash else 130000,
                          cash_usd=None if nullable_cash else 100,
                          starting_balance_krw=130000, starting_balance_usd=100,
                          duration_days=1, start_date=start - timedelta(days=1),
                          end_date=start + timedelta(seconds=1))
    db_session.add(session)
    db_session.flush()
    db_session.add(Holding(user_id=user.id, game_session_id=session.id, ticker='AAPL', name='Apple',
                           market='US', currency='USD', quantity=2, avg_price=90))
    db_session.commit()
    user_id, session_id = user.id, session.id

    def late_quote(*_):
        clock['now'] = start + timedelta(seconds=2)
        if operation == 'buy':
            return {'price': 100, 'currency': 'USD', 'name': 'Apple', 'market': 'US', 'sector': None, 'industry': None}
        return 1300 if operation == 'exchange' else 100

    provider = {'sell': 'get_stock_price', 'exchange': 'get_exchange_rate', 'buy': 'get_stock_info'}[operation]
    with patch(f'app.services.trading_service.{provider}', side_effect=late_quote), \
         patch('app.services.trading_service.take_session_snapshot') as snapshot:
        with pytest.raises(HTTPException) as exc:
            if operation == 'sell':
                sell_stock(db_session, user_id, 'AAPL', 1, session_id)
            elif operation == 'exchange':
                exchange_currency(db_session, user_id, 'USD', 'KRW', 50, session_id)
            else:
                buy_stock(db_session, user_id, 'AAPL', 1, session_id)
        assert exc.value.status_code == 400
        assert exc.value.detail == 'Game session has expired'
        assert not snapshot.called
    db_session.rollback()
    session = db_session.get(GameSession, session_id)
    assert session.cash_krw == (None if nullable_cash else 130000)
    assert session.cash_usd == (None if nullable_cash else 100)
    user = db_session.get(User, user_id)
    assert user.balance_krw == 130000
    assert user.balance_usd == 100
    assert db_session.query(Holding).one().quantity == 2
    assert db_session.query(Transaction).count() == 0
    assert db_session.query(PortfolioSnapshot).count() == 0
