import os
import pytest

# Must be set before any app module is imported (auth.py raises RuntimeError otherwise)
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest-do-not-use-in-prod"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app
from app.services.auth_rate_limit import auth_rate_limiter
from app.services.public_rate_limit import market_data_rate_limiter, trade_rate_limiter

SQLALCHEMY_TEST_URL = "sqlite:///:memory:"


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    for limiter in (auth_rate_limiter, market_data_rate_limiter, trade_rate_limiter):
        limiter.reset()
    yield
    for limiter in (auth_rate_limiter, market_data_rate_limiter, trade_rate_limiter):
        limiter.reset()


@pytest.fixture(scope="function")
def db_engine():
    # StaticPool: all connections share the same in-memory DB so create_all and
    # session queries see the same tables.
    engine = create_engine(
        SQLALCHEMY_TEST_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine):
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = TestingSession()
    yield session
    session.close()


# Stock/exchange mocks so no test ever touches yfinance or the network
MOCK_STOCK_INFO = {
    "price": 100.0,
    "currency": "USD",
    "name": "Test Corp",
    "market": "NASDAQ",
    "sector": "Technology",
    "industry": "Software",
}

MOCK_EXCHANGE_RATE = 1300.0  # 1 USD = 1300 KRW


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with patch("app.services.stock_service.get_stock_info", return_value=MOCK_STOCK_INFO), \
         patch("app.services.stock_service.get_stock_price", return_value=100.0), \
         patch("app.services.exchange_service.get_exchange_rate", return_value=MOCK_EXCHANGE_RATE), \
         patch("app.services.valuation_service.get_stock_info", return_value=MOCK_STOCK_INFO), \
         patch("app.services.valuation_service.get_stock_price", return_value=100.0), \
         patch("app.services.trading_service.get_stock_info", return_value=MOCK_STOCK_INFO), \
         patch("app.services.trading_service.get_stock_price", return_value=100.0), \
         patch("app.services.trading_service.get_exchange_rate", return_value=MOCK_EXCHANGE_RATE), \
         patch("app.services.snapshot_service.get_exchange_rate", return_value=MOCK_EXCHANGE_RATE), \
         patch("app.routes.analytics.get_exchange_rate", return_value=MOCK_EXCHANGE_RATE), \
         patch("app.routes.game.get_exchange_rate", return_value=MOCK_EXCHANGE_RATE), \
         patch("app.routes.portfolio.get_exchange_rate", return_value=MOCK_EXCHANGE_RATE):
        yield TestClient(app, raise_server_exceptions=True)

    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def test_password_hash():
    from app.auth import hash_password
    return hash_password("testpass123")


@pytest.fixture(scope="function")
def registered_user(db_session, test_password_hash):
    """Seed an authenticated user; registration itself is covered by auth/smoke tests."""
    from app.auth import create_access_token
    from app.models import User
    user = User(username="testuser", hashed_password=test_password_hash)
    db_session.add(user)
    db_session.commit()
    return {
        "user_id": user.id,
        "username": user.username,
        "access_token": create_access_token(user.id, user.username),
        "token_type": "bearer",
    }


@pytest.fixture(scope="function")
def auth_headers(registered_user):
    """Bearer headers for the registered test user."""
    return {"Authorization": f"Bearer {registered_user['access_token']}"}
