"""Opt-in real row-lock checks; isolated schemas on a disposable local database."""
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import GameSession, Holding, PortfolioSnapshot, Transaction, User
from app.routes.game import _create_session, delete_game_session, update_game_session
from app.routes.users import delete_user
from app.routes.watchlist import add_to_watchlist
from app.schemas import GameSessionUpdateRequest
from app.services.game_session_service import get_owned_session, lock_user_for_mutation
from app.services.snapshot_service import take_session_snapshot
from app.services.trading_service import buy_stock, exchange_currency


@pytest.fixture
def pg_sessions():
    url = os.environ.get('AUDIT_POSTGRES_URL')
    if not url:
        pytest.skip('AUDIT_POSTGRES_URL is required for disposable PostgreSQL checks')
    parsed = make_url(url)
    assert parsed.host in {'127.0.0.1', 'localhost'} and parsed.database == 'stock_game_audit'
    schema = 'audit_' + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA {schema}'))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema} -clock_timeout=5000 -cstatement_timeout=10000'})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    try:
        yield factory
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA {schema} CASCADE'))
        admin.dispose()


def seed(factory, count=1, cash_usd=100):
    with factory() as db:
        user = User(username='audit', balance_krw=1000, balance_usd=cash_usd)
        db.add(user)
        db.flush()
        ids = []
        for _ in range(count):
            now = datetime.now(timezone.utc)
            session = GameSession(user_id=user.id, title='Audit', status='active', cash_krw=1000, cash_usd=cash_usd,
                                  starting_balance_krw=1000, starting_balance_usd=cash_usd, duration_days=90,
                                  start_date=now, end_date=now + timedelta(days=90), is_active=True)
            db.add(session)
            db.flush()
            ids.append(session.id)
        db.commit()
        return user.id, ids


@pytest.fixture
def quote_mocks():
    info = {'price': 100, 'currency': 'USD', 'name': 'Apple', 'market': 'US', 'sector': 'Technology', 'industry': 'Hardware'}
    with patch('app.services.trading_service.get_stock_info', return_value=info), patch('app.services.valuation_service.get_stock_price', return_value=100), patch('app.services.snapshot_service.get_exchange_rate', return_value=1300), patch('app.routes.game.get_exchange_rate', return_value=1300):
        yield


@pytest.mark.parametrize('legacy', [False, True])
def test_concurrent_preloaded_buys_cannot_double_spend(pg_sessions, quote_mocks, legacy):
    user_id, ids = seed(pg_sessions, count=0 if legacy else 1)
    barrier = threading.Barrier(2)
    def buy():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            if not legacy:
                session = db.get(GameSession, ids[0])
            barrier.wait(timeout=5)
            try:
                buy_stock(db, user_id, 'AAPL', 1, None if legacy else ids[0])
                return 'ok'
            except ValueError as exc:
                db.rollback()
                assert 'Insufficient' in str(exc)
                return 'insufficient'
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: buy(), range(2)))
    assert sorted(results) == ['insufficient', 'ok']
    with pg_sessions() as db:
        assert db.get(User, user_id).balance_usd == 0
        assert db.query(Transaction).count() == 1
        assert db.query(Holding).one().quantity == 1
        if not legacy:
            assert db.get(GameSession, ids[0]).cash_usd == 0


@pytest.mark.parametrize('legacy', [False, True])
def test_concurrent_resend_of_one_order_executes_once(pg_sessions, quote_mocks, legacy):
    # Cash covers two fills, so only the Idempotency-Key can stop the second.
    user_id, ids = seed(pg_sessions, count=0 if legacy else 1, cash_usd=200)
    barrier = threading.Barrier(2)
    def buy():
        with pg_sessions() as db:
            barrier.wait(timeout=5)
            return buy_stock(db, user_id, 'AAPL', 1, None if legacy else ids[0],
                             client_request_id='concurrent-resend-key')
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: buy(), range(2)))
    assert sorted('replayed' in result for result in results) == [False, True]
    with pg_sessions() as db:
        assert db.query(Transaction).count() == 1
        assert db.query(Holding).one().quantity == 1
        assert db.get(User, user_id).balance_usd == 100
        if not legacy:
            assert db.get(GameSession, ids[0]).cash_usd == 100


def test_concurrent_resend_of_one_exchange_converts_once(pg_sessions, quote_mocks):
    # Cash covers two conversions, so only the Idempotency-Key can stop the second.
    user_id, ids = seed(pg_sessions, cash_usd=200)
    barrier = threading.Barrier(2)
    def exchange():
        with pg_sessions() as db:
            barrier.wait(timeout=5)
            return exchange_currency(db, user_id, 'USD', 'KRW', 100, ids[0],
                                     client_request_id='concurrent-exchange-key')
    with patch('app.services.trading_service.get_exchange_rate', return_value=1300), \
         ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: exchange(), range(2)))
    assert sorted('replayed' in result for result in results) == [False, True]
    with pg_sessions() as db:
        assert db.query(Transaction).count() == 1
        session = db.get(GameSession, ids[0])
        assert (session.cash_usd, session.cash_krw) == (100, 131000)


def test_concurrent_creation_preserves_active_session_cap(pg_sessions):
    user_id, _ = seed(pg_sessions, count=19)
    barrier = threading.Barrier(2)
    def create():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            barrier.wait(timeout=5)
            try:
                _create_session(db, user, title='New', duration_days=90, starting_balance_krw=1000)
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: create(), range(2))) == [200, 409]
    with pg_sessions() as db:
        assert db.query(GameSession).count() == 20


@pytest.mark.parametrize('operation', ['complete', 'delete', 'account_delete'])
def test_lifecycle_wins_against_preloaded_buy(pg_sessions, quote_mocks, operation):
    user_id, ids = seed(pg_sessions)
    ready, proceed = threading.Event(), threading.Event()
    def buy():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            ready.set()
            assert proceed.wait(timeout=5)
            try:
                buy_stock(db, user_id, 'AAPL', 1, ids[0])
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=1) as pool:
        result = pool.submit(buy)
        assert ready.wait(timeout=5)
        with pg_sessions() as db:
            user = db.get(User, user_id)
            if operation == 'complete':
                update_game_session(ids[0], GameSessionUpdateRequest(status='completed'), db, user)
            elif operation == 'delete':
                delete_game_session(ids[0], db, user)
            else:
                delete_user(user_id, db, user)
        proceed.set()
        assert result.result(timeout=10) == (400 if operation == 'complete' else 404)
    with pg_sessions() as db:
        assert db.query(Transaction).count() == 0
        assert db.query(Holding).count() == 0


def test_snapshot_waits_and_refreshes_cash_and_holdings(pg_sessions, quote_mocks):
    user_id, ids = seed(pg_sessions)
    ready, proceed = threading.Event(), threading.Event()
    def snapshot():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            ready.set()
            assert proceed.wait(timeout=5)
            return take_session_snapshot(db, user_id, ids[0]).total_value_krw
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(snapshot)
        assert ready.wait(timeout=5)
        with pg_sessions() as db:
            user = lock_user_for_mutation(db, user_id)
            session = get_owned_session(db, user, ids[0], for_update=True)
            session.cash_usd = 0
            user.balance_usd = 0
            db.add(Holding(user_id=user_id, game_session_id=ids[0], ticker='AAPL', market='US', currency='USD', quantity=1, avg_price=100))
            proceed.set()
            db.commit()
        assert future.result(timeout=10) == 131000
    with pg_sessions() as db:
        snapshot = db.query(PortfolioSnapshot).one()
        assert snapshot.cash_usd == 0
        assert snapshot.total_holdings_value_krw == 130000


def test_account_delete_blocks_preloaded_watchlist_insert(pg_sessions, quote_mocks):
    user_id, _ = seed(pg_sessions)
    ready, proceed = threading.Event(), threading.Event()
    def add():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            ready.set()
            assert proceed.wait(timeout=5)
            try:
                add_to_watchlist('AAPL', db, user)
                return 200
            except HTTPException as exc:
                return exc.status_code
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(add)
        assert ready.wait(timeout=5)
        with pg_sessions() as db:
            delete_user(user_id, db, db.get(User, user_id))
        proceed.set()
        assert future.result(timeout=10) == 404


def test_concurrent_sells_cannot_oversell(pg_sessions, quote_mocks):
    from app.services.trading_service import sell_stock
    user_id, ids = seed(pg_sessions, cash_usd=0)
    with pg_sessions() as db:
        db.add(Holding(user_id=user_id, game_session_id=ids[0], ticker='AAPL', market='US', currency='USD', quantity=1, avg_price=90))
        db.commit()
    barrier = threading.Barrier(2)
    def sell():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            holding = db.query(Holding).one()
            barrier.wait(timeout=5)
            try:
                sell_stock(db, user_id, 'AAPL', 1, ids[0])
                return 'ok'
            except ValueError as exc:
                db.rollback()
                assert "don't own" in str(exc)
                return 'missing'
    with patch('app.services.trading_service.get_stock_price', return_value=100):
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(lambda _: sell(), range(2))) == ['missing', 'ok']
    with pg_sessions() as db:
        assert db.query(Holding).count() == 0
        assert db.query(Transaction).count() == 1
        assert db.get(GameSession, ids[0]).cash_usd == 100


def test_stale_active_patch_cannot_reactivate_completed_session(pg_sessions, quote_mocks):
    user_id, ids = seed(pg_sessions)
    ready, proceed = threading.Event(), threading.Event()
    def activate():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            ready.set()
            assert proceed.wait(timeout=5)
            try:
                update_game_session(ids[0], GameSessionUpdateRequest(status='active'), db, user)
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(activate)
        assert ready.wait(timeout=5)
        with pg_sessions() as db:
            update_game_session(ids[0], GameSessionUpdateRequest(status='completed'), db, db.get(User, user_id))
        proceed.set()
        assert future.result(timeout=10) == 400
    with pg_sessions() as db:
        assert db.get(GameSession, ids[0]).status == 'completed'


def test_deleted_session_cannot_receive_stale_snapshot(pg_sessions, quote_mocks):
    user_id, ids = seed(pg_sessions)
    ready, proceed = threading.Event(), threading.Event()
    def snapshot():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            ready.set()
            assert proceed.wait(timeout=5)
            try:
                take_session_snapshot(db, user_id, ids[0])
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(snapshot)
        assert ready.wait(timeout=5)
        with pg_sessions() as db:
            delete_game_session(ids[0], db, db.get(User, user_id))
        proceed.set()
        assert future.result(timeout=10) == 404
    with pg_sessions() as db:
        assert db.query(PortfolioSnapshot).count() == 0


def test_concurrent_exchange_cannot_double_spend(pg_sessions, quote_mocks):
    from app.services.trading_service import exchange_currency
    user_id, ids = seed(pg_sessions, cash_usd=100)
    barrier = threading.Barrier(2)
    def exchange():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            barrier.wait(timeout=5)
            try:
                exchange_currency(db, user_id, 'USD', 'KRW', 100, ids[0])
                return 'ok'
            except ValueError as exc:
                db.rollback()
                assert 'Insufficient' in str(exc)
                return 'insufficient'
    with patch('app.services.trading_service.get_exchange_rate', return_value=1300):
        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(lambda _: exchange(), range(2))) == ['insufficient', 'ok']
    with pg_sessions() as db:
        session = db.get(GameSession, ids[0])
        assert session.cash_usd == 0
        assert session.cash_krw == 131000
        assert db.query(Transaction).count() == 1


def test_nullable_cash_backfill_refreshes_after_trade(pg_sessions, quote_mocks):
    from app.services.portfolio_compatibility import ensure_session_cash_for_read
    user_id, ids = seed(pg_sessions)
    with pg_sessions() as db:
        db.get(GameSession, ids[0]).cash_usd = None
        db.commit()
    ready, proceed = threading.Event(), threading.Event()
    def read_and_backfill():
        with pg_sessions() as db:
            user = db.get(User, user_id)
            session = db.get(GameSession, ids[0])
            assert session.cash_usd is None
            ready.set()
            assert proceed.wait(timeout=5)
            return ensure_session_cash_for_read(db, session, user).cash_usd
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(read_and_backfill)
        assert ready.wait(timeout=5)
        with pg_sessions() as db:
            buy_stock(db, user_id, 'AAPL', 1, ids[0])
        proceed.set()
        assert future.result(timeout=10) == 0
    with pg_sessions() as db:
        assert db.get(GameSession, ids[0]).cash_usd == 0


def test_late_post_trade_capture_cannot_mutate_completed_result(pg_sessions, quote_mocks):
    from app.routes.game import _build_session_result
    user_id, ids = seed(pg_sessions)
    with pg_sessions() as db:
        take_session_snapshot(db, user_id, ids[0])
    committed, capture = threading.Event(), threading.Event()
    def delayed_snapshot(db, uid, sid):
        committed.set()
        assert capture.wait(timeout=5)
        return take_session_snapshot(db, uid, sid)
    def buy():
        with pg_sessions() as db:
            return buy_stock(db, user_id, 'AAPL', 1, ids[0])
    with patch('app.services.trading_service.take_session_snapshot', side_effect=delayed_snapshot):
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(buy)
            assert committed.wait(timeout=5)
            with pg_sessions() as db:
                update_game_session(ids[0], GameSessionUpdateRequest(status='completed'), db, db.get(User, user_id))
            capture.set()
            assert future.result(timeout=10)['status'] == 'success'
    with pg_sessions() as db:
        assert db.query(Transaction).count() == 1
        assert db.query(PortfolioSnapshot).count() == 1
        session = db.get(GameSession, ids[0])
        result = _build_session_result(db, db.get(User, user_id), session)
        assert result['ending_value_krw'] == 131000
        assert result['ending_value_source'] == 'last_snapshot'
        assert result['ending_value_as_of'] is not None
