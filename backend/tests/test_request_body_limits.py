import asyncio
import json
from unittest.mock import AsyncMock, Mock

from fastapi.routing import run_endpoint_function

import pytest

from app.database import get_db
from app.main import app
from app.models import User

BODY_LIMIT = 64 * 1024
TRUSTED_ORIGIN = 'http://localhost:5173'


def registration_body(size):
    body = json.dumps({'username': 'body-limit-user', 'password': 'strong123', 'padding': ''}).encode()
    assert size >= len(body)
    return body[:-2] + (b' ' * (size - len(body))) + body[-2:]


@pytest.fixture
def guarded_client(client, db_session, monkeypatch):
    dependency = Mock()
    def tracked_db():
        dependency()
        yield db_session
    app.dependency_overrides[get_db] = tracked_db
    handler = AsyncMock(wraps=run_endpoint_function)
    monkeypatch.setattr('fastapi.routing.run_endpoint_function', handler)
    password_hash = Mock(return_value='test-only-password-hash')
    monkeypatch.setattr('app.routes.auth.hash_password', password_hash)
    return client, dependency, handler, password_hash


def assert_security_headers(headers, origin):
    assert headers['x-content-type-options'] == 'nosniff'
    assert headers['x-frame-options'] == 'DENY'
    assert headers['referrer-policy'] == 'no-referrer'
    assert 'max-age=' in headers['strict-transport-security']
    if origin == TRUSTED_ORIGIN:
        assert headers['access-control-allow-origin'] == TRUSTED_ORIGIN
    else:
        assert 'access-control-allow-origin' not in headers
    assert headers.get('access-control-allow-credentials') != 'true'


@pytest.mark.parametrize('size', [256, BODY_LIMIT])
def test_valid_registration_body_at_or_below_limit_is_accepted(guarded_client, db_session, size):
    client, dependency, handler, password_hash = guarded_client
    response = client.post('/auth/register', content=registration_body(size), headers={'Content-Type': 'application/json'})
    assert response.status_code == 201
    dependency.assert_called_once()
    handler.assert_called_once()
    password_hash.assert_called_once()
    assert db_session.query(User).count() == 1


@pytest.mark.parametrize('origin', [TRUSTED_ORIGIN, 'https://evil.example'])
def test_declared_oversized_body_is_rejected_before_dependencies(guarded_client, db_session, origin):
    client, dependency, handler, password_hash = guarded_client
    response = client.post('/auth/register', content=registration_body(BODY_LIMIT + 1), headers={'Content-Type': 'application/json', 'Origin': origin})
    assert response.status_code == 413
    assert_security_headers(response.headers, origin)
    dependency.assert_not_called()
    handler.assert_not_called()
    password_hash.assert_not_called()
    assert db_session.query(User).count() == 0


def send_raw_chunks(chunks, content_length, origin):
    async def request():
        sent = []
        finished = asyncio.Event()
        remaining = list(chunks)
        headers = [(b'content-type', b'application/json'), (b'origin', origin.encode())]
        if content_length is not None:
            headers.append((b'content-length', str(content_length).encode()))
        async def receive():
            if remaining:
                body = remaining.pop(0)
                return {'type': 'http.request', 'body': body, 'more_body': bool(remaining)}
            await finished.wait()
            return {'type': 'http.disconnect'}
        async def send(message):
            sent.append(message)
            if message['type'] == 'http.response.body' and not message.get('more_body', False):
                finished.set()
        scope = {'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
                 'method': 'POST', 'scheme': 'http', 'path': '/auth/register',
                 'raw_path': b'/auth/register', 'query_string': b'', 'root_path': '',
                 'headers': headers, 'client': ('127.0.0.1', 1234), 'server': ('testserver', 80)}
        await app(scope, receive, send)
        start = next(message for message in sent if message['type'] == 'http.response.start')
        return start['status'], {key.decode(): value.decode() for key, value in start['headers']}
    return asyncio.run(request())


@pytest.mark.parametrize('content_length', [None, 1])
@pytest.mark.parametrize('origin', [TRUSTED_ORIGIN, 'https://evil.example'])
def test_chunked_or_understated_body_cannot_bypass_limit(guarded_client, db_session, content_length, origin):
    _, dependency, handler, password_hash = guarded_client
    body = registration_body(BODY_LIMIT + 1)
    status, headers = send_raw_chunks([body[:BODY_LIMIT], body[BODY_LIMIT:]], content_length, origin)
    assert status == 413
    assert_security_headers(headers, origin)
    dependency.assert_not_called()
    handler.assert_not_called()
    password_hash.assert_not_called()
    assert db_session.query(User).count() == 0


def test_chunked_body_at_limit_is_accepted(guarded_client, db_session):
    _, dependency, handler, password_hash = guarded_client
    body = registration_body(BODY_LIMIT)
    status, _ = send_raw_chunks([body[:32000], body[32000:]], None, TRUSTED_ORIGIN)
    assert status == 201
    dependency.assert_called_once()
    handler.assert_called_once()
    password_hash.assert_called_once()
    assert db_session.query(User).count() == 1
