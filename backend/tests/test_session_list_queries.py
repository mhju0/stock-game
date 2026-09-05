"""The hub must retain scoped values without a query/quote waterfall per game."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import event

from app.models import GameSession, Holding, PortfolioSnapshot, User


@pytest.mark.parametrize('count,missing_cash', [(1, False), (20, False), (20, True)])
def test_session_list_has_bounded_queries_and_deduplicates_quotes(
    client, db_session, db_engine, registered_user, auth_headers, count, missing_cash,
):
    user_id = registered_user['user_id']
    db_session.get(User, user_id).balance_krw = 1000
    now = datetime.now(timezone.utc)
    for index in range(count):
        session = GameSession(
            user_id=user_id, title=str(index), status='active',
            starting_balance_krw=1000, cash_krw=None if missing_cash else 1000, cash_usd=0,
            duration_days=90, start_date=now, end_date=now + timedelta(days=90),
        )
        db_session.add(session)
        db_session.flush()
        db_session.add(Holding(
            user_id=user_id, game_session_id=session.id, ticker='AAPL',
            market='US', currency='USD', quantity=index + 1, avg_price=50,
        ))
        for offset in [1, 2]:
            db_session.add(PortfolioSnapshot(
                user_id=user_id, game_session_id=session.id, total_value_krw=1000,
                total_holdings_value_krw=0, cash_krw=1000, cash_usd=0,
                exchange_rate=1300, created_at=now - timedelta(days=offset),
            ))
    # Legacy and another owner's rows must not contaminate the bulk lookup.
    other = User(username='other', balance_krw=1000, balance_usd=0)
    db_session.add(other)
    db_session.flush()
    for owner in [user_id, other.id]:
        db_session.add(Holding(
            user_id=owner, game_session_id=session.id if owner != user_id else None, ticker='MSFT', market='US', currency='USD',
            quantity=999, avg_price=50,
        ))
    db_session.commit()
    statements = []

    def record(_conn, _cursor, statement, _params, _context, _many):
        if statement.lstrip().upper().startswith('SELECT'):
            statements.append(statement)

    event.listen(db_engine, 'before_cursor_execute', record)
    try:
        with patch('app.services.valuation_service.get_stock_price', return_value=100) as price:
            response = client.get('/game/sessions?include_all=true', headers=auth_headers)
    finally:
        event.remove(db_engine, 'before_cursor_execute', record)
    assert response.status_code == 200
    sessions = response.json()['sessions']
    assert len(sessions) == count
    for session in sessions:
        assert session['current_value_krw'] == 1000 + (int(session['title']) + 1) * 100 * 1300
        assert session['last_updated_at'] == (now - timedelta(days=1)).isoformat()
    print(f'{count} sessions: {len(statements)} SELECTs, {price.call_count} quote lookups')
    assert len(statements) <= (5 if missing_cash else 4)  # authentication, sessions, holdings, latest timestamps
    price.assert_called_once_with('AAPL')
