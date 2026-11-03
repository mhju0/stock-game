import sys
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services import market_data_provider, stock_service


@pytest.mark.parametrize('cache_name', ['price', 'metadata', 'info'])
def test_concurrent_eviction_remains_bounded_without_errors(monkeypatch, cache_name):
    cache = {}
    if cache_name == 'info':
        monkeypatch.setattr(stock_service, '_info_cache', cache)
        monkeypatch.setattr(stock_service, 'MAX_INFO_CACHE_KEYS', 2)
        def store(key):
            stock_service._store_info(key, {'name': 'Audit', 'price': 100}, 0)
    else:
        monkeypatch.setattr(market_data_provider, f'_{cache_name}_cache', cache)
        monkeypatch.setattr(market_data_provider, 'MAX_CACHE_KEYS', 2)
        def store(key):
            market_data_provider._store(cache, key, 100, 0)

    barrier = threading.Barrier(8)
    def write(worker_id):
        errors = []
        barrier.wait(timeout=5)
        for index in range(1500):
            try:
                store(f'{worker_id}-{index}')
                assert len(cache) <= 2
            except Exception as exc:
                errors.append(type(exc).__name__)
        return errors

    previous_interval = sys.getswitchinterval()
    try:
        sys.setswitchinterval(0.000001)
        with ThreadPoolExecutor(max_workers=8) as workers:
            errors = [error for result in workers.map(write, range(8)) for error in result]
    finally:
        sys.setswitchinterval(previous_interval)

    assert not errors, f'{len(errors)} concurrent cache errors: {sorted(set(errors))}'
    assert len(cache) == 2
    if cache_name == 'info':
        assert all('price' not in entry['value'] for entry in cache.values())


def test_bounded_caches_preserve_fifo_eviction(monkeypatch):
    cache = {}
    monkeypatch.setattr(market_data_provider, 'MAX_CACHE_KEYS', 2)
    monkeypatch.setattr(stock_service, 'MAX_INFO_CACHE_KEYS', 2)
    monkeypatch.setattr(stock_service, '_info_cache', {})
    for key in ('oldest', 'middle', 'newest'):
        assert market_data_provider._store(cache, key, 100, 0) == 100
        stock_service._store_info(key, {'name': key, 'price': 100}, 0)
    assert list(cache) == ['middle', 'newest']
    assert list(stock_service._info_cache) == ['middle', 'newest']
