from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch
import pandas as pd
import pytest
from sqlalchemy import update
from app.models import GameSession, Holding, PortfolioSnapshot, User
from app.routes.analytics import _realized_response
from app.services import market_data_provider, stock_service
from app.services.game_session_service import get_owned_session
from app.services.snapshot_service import take_session_snapshot
from app.services.trading_service import _load_user
from app.services.valuation_service import compute_holdings_value_krw

@pytest.mark.parametrize('path,payload', [('/game/sessions', {'duration_days': 10**30}), ('/game/new', {'duration_days': 10**30}), ('/game/sessions', {'starting_balance_usd': 1e308}), ('/game/sessions', {'starting_balance_krw': 1e308}), ('/game/new', {'starting_balance_krw': 1e308}), ('/game/sessions', {'title': 'x' * 81})])
def test_invalid_session_input_never_writes(client, auth_headers, db_session, path, payload):
    response = client.post(path, json=payload, headers=auth_headers)
    assert response.status_code == 422
    assert db_session.query(GameSession).count() == 0

def test_locked_user_refreshes_preloaded_identity(db_session, registered_user):
    user = db_session.get(User, registered_user['user_id'])
    db_session.execute(update(User).where(User.id == user.id).values(balance_usd=7), execution_options={'synchronize_session': False})
    assert _load_user(db_session, user.id).balance_usd == 7

def make_session(db_session, user_id):
    now = datetime.now(timezone.utc)
    session = GameSession(user_id=user_id, title='Audit', status='active', cash_krw=1000, cash_usd=10, starting_balance_krw=1000, starting_balance_usd=10, start_date=now, end_date=now + timedelta(days=90), duration_days=90, is_active=True)
    db_session.add(session)
    db_session.commit()
    return session

def test_locked_session_refreshes_preloaded_identity(db_session, registered_user):
    user = db_session.get(User, registered_user['user_id'])
    session = make_session(db_session, user.id)
    db_session.execute(update(GameSession).where(GameSession.id == session.id).values(status='completed'), execution_options={'synchronize_session': False})
    assert get_owned_session(db_session, user, session.id, for_update=True).status == 'completed'

@pytest.mark.parametrize('value', [float('inf'), float('-inf'), float('nan'), 0.0, -1.0])
def test_nonfinite_provider_price_and_rate(value):
    fake = SimpleNamespace(Ticker=lambda _: SimpleNamespace(history=lambda **_: pd.DataFrame({'Close': [value]})))
    market_data_provider._price_cache.clear()
    market_data_provider._exchange_rate_cache.update(value=None, timestamp=0)
    with patch.object(market_data_provider, 'yf', fake):
        assert market_data_provider.get_stock_price('AUDIT') is None
        assert market_data_provider.get_exchange_rate() == 1350.0

def test_missing_price_cannot_be_valued_or_snapshotted(db_session, registered_user):
    session = make_session(db_session, registered_user['user_id'])
    holding = Holding(user_id=session.user_id, game_session_id=session.id, ticker='AAPL', name='Apple', market='US', currency='USD', quantity=1, avg_price=100)
    db_session.add(holding)
    db_session.commit()
    with pytest.raises(ValueError, match='market price'):
        compute_holdings_value_krw([holding], 1300, {'AAPL': None})
    with patch('app.services.valuation_service.get_stock_price', return_value=None), patch('app.services.snapshot_service.get_exchange_rate', return_value=1300):
        with pytest.raises(ValueError, match='market price'):
            take_session_snapshot(db_session, session.user_id, session.id)
    assert db_session.query(PortfolioSnapshot).count() == 0

@pytest.mark.parametrize('path', ['portfolio/account', 'analytics/performance', 'status', 'summary'])
def test_missing_price_returns_explicit_unavailable(client, auth_headers, db_session, registered_user, path):
    session = make_session(db_session, registered_user['user_id'])
    db_session.add(Holding(user_id=session.user_id, game_session_id=session.id, ticker='AAPL', name='Apple', market='US', currency='USD', quantity=1, avg_price=100))
    db_session.commit()
    with patch('app.services.valuation_service.get_stock_price', return_value=None):
        response = client.get(f'/game/sessions/{session.id}/{path}', headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body['valuation_available'] is False
    assert body.get('total_value_krw', body.get('current_value_krw', body.get('current_value'))) is None

def test_realized_never_adds_or_ranks_different_currencies():
    sells = [SimpleNamespace(transaction_type='SELL', ticker='AAPL', name='Apple', currency='USD', realized_pnl=100), SimpleNamespace(transaction_type='SELL', ticker='005930.KS', name='Samsung', currency='KRW', realized_pnl=1000)]
    body = _realized_response(sells)
    assert body['total_realized_pnl'] is None
    assert body['realized_pnl_by_currency'] == {'KRW': 1000, 'USD': 100}
    assert body['best_trade'] is None
    assert body['worst_trade'] is None

@pytest.mark.parametrize('ticker,metadata', [('7203.T', {'shortName': 'Toyota', 'currency': 'JPY', 'exchange': 'JPX'}), ('AAPL', {'shortName': 'Apple', 'currency': 'JPY', 'exchange': 'NMS'})])
def test_unsupported_currency_cannot_be_traded_as_usd(ticker, metadata):
    stock_service._info_cache.clear()
    with patch.object(market_data_provider, 'get_ticker_metadata', return_value=metadata), patch.object(stock_service, 'get_stock_price', return_value=100):
        assert stock_service.get_stock_info(ticker) is None

def test_lowercase_korean_suffix_preserves_currency():
    stock_service._info_cache.clear()
    with patch.object(market_data_provider, 'get_ticker_metadata', return_value={'shortName': 'Samsung', 'currency': 'KRW', 'exchange': 'KSC'}), patch.object(stock_service, 'get_stock_price', return_value=100):
        assert stock_service.get_stock_info('005930.ks')['currency'] == 'KRW'


def test_info_cache_is_bounded(monkeypatch):
    stock_service._info_cache.clear()
    monkeypatch.setattr(stock_service, "MAX_INFO_CACHE_KEYS", 2)
    with patch.object(market_data_provider, "get_ticker_metadata", return_value={"shortName": "Test", "currency": "USD", "exchange": "NMS"}), patch.object(stock_service, "get_stock_price", return_value=100):
        for ticker in ("AA", "BB", "CC"):
            stock_service.get_stock_info(ticker)
    assert set(stock_service._info_cache) == {"BB", "CC"}


def test_session_creation_throttles_after_completions(client, auth_headers):
    from app.services.public_rate_limit import SESSION_CREATE_LIMIT
    for _ in range(SESSION_CREATE_LIMIT):
        response = client.post("/game/sessions", json={}, headers=auth_headers)
        assert response.status_code == 200
        assert client.delete(f"/game/sessions/{response.json()['session']['id']}", headers=auth_headers).status_code == 200
    response = client.post("/game/new", json={}, headers=auth_headers)
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0


def test_snapshot_loop_survives_batch_failure(monkeypatch):
    import asyncio
    import app.main as main
    calls = []
    async def no_sleep(_):
        pass
    async def failing_then_cancel(_):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database temporarily unavailable")
        raise asyncio.CancelledError()
    monkeypatch.setattr(main.asyncio, "sleep", no_sleep)
    monkeypatch.setattr(main.asyncio, "to_thread", failing_then_cancel)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(main.snapshot_loop())
    assert len(calls) == 2


@pytest.mark.parametrize("rate", [float("inf"), float("nan"), 1e-308])
def test_exchange_invalid_conversion_never_changes_cash(db_session, registered_user, rate):
    from app.services.trading_service import exchange_currency
    session = make_session(db_session, registered_user["user_id"])
    with patch("app.services.trading_service.get_exchange_rate", return_value=rate):
        with pytest.raises(ValueError, match="exchange"):
            exchange_currency(db_session, session.user_id, "KRW", "USD", 1000, session.id)
    assert session.cash_krw == 1000
    assert session.cash_usd == 10


def test_sell_overflow_never_changes_cash(db_session, registered_user):
    from app.services.trading_service import sell_stock
    session = make_session(db_session, registered_user["user_id"])
    db_session.add(Holding(user_id=session.user_id, game_session_id=session.id, ticker="AAPL", name="Apple", market="US", currency="USD", quantity=100, avg_price=100))
    db_session.commit()
    with patch("app.services.trading_service.get_stock_price", return_value=1e308):
        with pytest.raises(ValueError, match="price"):
            sell_stock(db_session, session.user_id, "AAPL", 100, session.id)
    assert session.cash_usd == 10


def test_mixed_case_trades_consolidate_and_sell(client, auth_headers, db_session):
    session = client.post('/game/sessions', json={'starting_balance_usd': 1000}, headers=auth_headers).json()['session']
    base = f"/game/sessions/{session['id']}/trade"
    for ticker in ['aapl', 'AAPL']:
        assert client.post(base + '/buy', json={'ticker': ticker, 'quantity': 1}, headers=auth_headers).status_code == 200
    assert db_session.query(Holding).one().ticker == 'AAPL'
    assert db_session.query(Holding).one().quantity == 2
    assert client.post(base + '/sell', json={'ticker': 'aaPl', 'quantity': 2}, headers=auth_headers).status_code == 200
    assert db_session.query(Holding).count() == 0


def test_mixed_case_watchlist_uses_same_item(client, auth_headers, db_session):
    assert client.post('/watchlist/add?ticker=aapl', headers=auth_headers).status_code == 200
    assert client.get('/watchlist/contains?ticker=AaPl', headers=auth_headers).json()['in_watchlist'] is True
    assert client.post('/watchlist/add?ticker=AAPL', headers=auth_headers).status_code == 400
    assert client.delete('/watchlist/remove/aApL', headers=auth_headers).status_code == 200


def test_missing_quote_preserves_saved_result_and_marks_list(client, auth_headers, db_session, registered_user):
    session = make_session(db_session, registered_user['user_id'])
    session.status = 'completed'
    session.is_active = False
    db_session.add(Holding(user_id=session.user_id, game_session_id=session.id, ticker='AAPL', market='US', currency='USD', quantity=1, avg_price=100))
    db_session.add(PortfolioSnapshot(user_id=session.user_id, game_session_id=session.id, total_value_krw=123456, total_holdings_value_krw=110000, cash_krw=456, cash_usd=10, exchange_rate=1300))
    db_session.commit()
    with patch('app.services.valuation_service.get_stock_price', return_value=None):
        listed = client.get('/game/sessions?include_all=true', headers=auth_headers).json()['sessions'][0]
        result = client.get(f'/game/sessions/{session.id}/result', headers=auth_headers).json()
        holdings = client.get(f'/game/sessions/{session.id}/portfolio/holdings', headers=auth_headers).json()
        for route in ['analytics/by-stock', 'analytics/by-sector']:
            assert client.get(f'/game/sessions/{session.id}/{route}', headers=auth_headers).status_code == 503
    assert listed['valuation_available'] is True
    assert listed['current_value_krw'] == result['ending_value_krw'] == 123456
    assert listed['valuation_source'] == 'last_snapshot'
    assert listed['valuation_as_of'] is not None
    assert result['ending_value_krw'] == 123456
    assert result['ending_value_source'] == 'last_snapshot'
    assert holdings[0]['total_value'] is None
    assert holdings[0]['unrealized_pnl'] is None


def test_missing_realized_pnl_is_unavailable_without_ranking():
    sells = [SimpleNamespace(transaction_type='SELL', ticker='AAPL', name='Apple', currency='USD', realized_pnl=None)]
    body = _realized_response(sells)
    assert body['realized_pnl_available'] is False
    assert body['total_realized_pnl'] is None
    assert body['best_trade'] is None
    assert body['win_rate'] is None


def test_single_currency_trade_retains_currency_and_known_totals():
    sells = [SimpleNamespace(transaction_type='SELL', ticker='AAPL', name='Apple', currency='USD', realized_pnl=100)]
    body = _realized_response(sells)
    assert body['realized_pnl_available'] is True
    assert body['total_realized_pnl'] == 100
    assert body['realized_pnl_by_currency'] == {'USD': 100}
    assert body['best_trade']['currency'] == 'USD'


def test_provider_history_and_batch_exclude_nonfinite_values():
    frame = pd.DataFrame({'Open': [100, float('inf')], 'High': [110, 110], 'Low': [90, 90], 'Close': [105, float('inf')], 'Volume': [10, 10]}, index=pd.to_datetime(['2026-01-01', '2026-01-02']))
    fake = SimpleNamespace(Ticker=lambda _: SimpleNamespace(history=lambda **_: frame), download=lambda *_, **__: frame)
    with patch.object(market_data_provider, 'yf', fake):
        assert len(market_data_provider.get_stock_history('AAPL')) == 1
        assert market_data_provider.fetch_market_closes(['AAPL']) == {}
        assert len(market_data_provider.get_close_history('AAPL', '2026-01-01')) == 1


def test_account_daily_change_identifies_saved_reference(client, auth_headers, db_session, registered_user):
    session = make_session(db_session, registered_user['user_id'])
    response = client.get(f'/game/sessions/{session.id}/portfolio/account', headers=auth_headers).json()
    assert response['daily_change_basis'] == 'starting_value'
    assert response['daily_change_reference_date'] == session.start_date.isoformat()
    for days_ago in [2, 1]:
        db_session.add(PortfolioSnapshot(user_id=session.user_id, game_session_id=session.id, total_value_krw=100, total_holdings_value_krw=0, cash_krw=100, cash_usd=0, exchange_rate=1300, created_at=datetime.now(timezone.utc) - timedelta(days=days_ago)))
    db_session.commit()
    response = client.get(f'/game/sessions/{session.id}/portfolio/account', headers=auth_headers).json()
    assert response['daily_change_basis'] == 'previous_snapshot'
    assert response['daily_change_reference_date'] is not None


@pytest.mark.parametrize('state', ['completed', 'archived', 'expired'])
def test_ended_session_rejects_new_snapshot(db_session, registered_user, state):
    session = make_session(db_session, registered_user['user_id'])
    session.status = state if state != 'expired' else 'active'
    if state == 'expired':
        session.end_date = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    with patch('app.services.snapshot_service.get_exchange_rate', return_value=1300) as rate:
        with pytest.raises(ValueError, match='ended'):
            take_session_snapshot(db_session, session.user_id, session.id)
    assert not rate.called
    assert db_session.query(PortfolioSnapshot).count() == 0


def test_expiry_during_quote_lookup_does_not_write_snapshot(db_session, registered_user):
    session = make_session(db_session, registered_user['user_id'])
    def expire():
        session.end_date = datetime.now(timezone.utc) - timedelta(seconds=1)
        return 1300
    with patch('app.services.snapshot_service.get_exchange_rate', side_effect=expire):
        with pytest.raises(ValueError, match='ended'):
            take_session_snapshot(db_session, session.user_id, session.id)
    assert db_session.query(PortfolioSnapshot).count() == 0


def test_ended_list_matches_result_latest_saved_observation(client, auth_headers, db_session, registered_user):
    session = make_session(db_session, registered_user['user_id'])
    session.status = 'completed'
    session.is_active = False
    session.completed_at = datetime.now(timezone.utc) - timedelta(days=1)
    for days, value in [(2, 1000), (0, 1500)]:
        db_session.add(PortfolioSnapshot(user_id=session.user_id, game_session_id=session.id, total_value_krw=value, total_holdings_value_krw=0, cash_krw=value, cash_usd=0, exchange_rate=1300, created_at=datetime.now(timezone.utc) - timedelta(days=days)))
    db_session.commit()
    with patch('app.services.valuation_service.get_stock_price', return_value=99999):
        listed = client.get('/game/sessions?include_all=true', headers=auth_headers).json()['sessions'][0]
        result = client.get(f'/game/sessions/{session.id}/result', headers=auth_headers).json()
    assert listed['current_value_krw'] == result['ending_value_krw'] == 1500
    assert listed['current_return_pct'] == result['total_return_pct'] == 50
    assert listed['valuation_as_of'] == result['ending_value_as_of']
    assert listed['valuation_uses_live_fx'] is False
