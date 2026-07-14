import logging

from sqlalchemy.orm import Session

from app.models import GameSession, Holding, Transaction, User
from app.services.exchange_service import get_exchange_rate
from app.services.game_session_service import (
    ensure_session_cash_initialized,
    get_current_session,
    get_tradeable_session,
    sync_legacy_user_balance,
)
from app.services.snapshot_service import take_session_snapshot, take_snapshot
from app.services.stock_service import get_stock_info, get_stock_price

logger = logging.getLogger(__name__)


def _load_user(db: Session, user_id: int) -> User:
    # Lock the user row for the duration of the trade so the legacy check-and-
    # debit on User.balance_* cannot race with a concurrent trade. No-op on
    # SQLite (dev/tests); a real row lock on Postgres.
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise ValueError("User not found")
    return user


def _resolve_trade_session(db: Session, user: User, game_session_id: int | None):
    # for_update=True locks the GameSession row so session cash check-and-debit
    # is atomic under concurrent trades.
    if game_session_id is not None:
        return get_tradeable_session(db, user, game_session_id, for_update=True)
    current_session = get_current_session(db, user)
    if current_session is None:
        return None
    return get_tradeable_session(db, user, current_session.id, for_update=True)


def _transaction_response(transaction_type, ticker, name, quantity, price, amount_key, amount, currency, realized_pnl=None):
    body = {
        "type": transaction_type,
        "ticker": ticker,
        "name": name,
        "quantity": quantity,
        "price": price,
        amount_key: amount,
        "currency": currency,
    }
    if realized_pnl is not None:
        body["realized_pnl"] = realized_pnl
    return body


def _capture_post_trade_snapshot(snapshot_func, *args) -> None:
    try:
        snapshot_func(*args)
    except Exception:
        logger.exception("Post-trade snapshot capture failed")
        # The trade/exchange mutation is already committed. Keep the API
        # response aligned with persisted state instead of reporting a false
        # transaction failure to the user.
        args[0].rollback()


class _LegacyPortfolioTradeAdapter:
    """Persist trades against the migration-era user-level portfolio."""

    session_id = None

    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user

    def prepare_cash(self) -> None:
        # Legacy buy/sell behavior does not normalize nullable balances.
        return None

    def prepare_exchange_cash(self) -> None:
        self.user.balance_krw = self.user.balance_krw or 0.0
        self.user.balance_usd = self.user.balance_usd or 0.0

    def balance(self, currency: str) -> float:
        return self.user.balance_krw if currency == "KRW" else self.user.balance_usd

    def adjust_balance(self, currency: str, amount: float) -> None:
        if currency == "KRW":
            self.user.balance_krw += amount
        else:
            self.user.balance_usd += amount

    def find_buy_holding(self, ticker: str, market: str) -> Holding | None:
        # Legacy rows are ticker-scoped. Preserve that selection until the
        # Legacy Portfolio is retired by a separately approved migration.
        return (
            self.db.query(Holding)
            .filter(
                Holding.user_id == self.user.id,
                Holding.ticker == ticker,
                Holding.game_session_id.is_(None),
            )
            .first()
        )

    def find_sell_holding(self, ticker: str) -> Holding | None:
        return (
            self.db.query(Holding)
            .filter(
                Holding.user_id == self.user.id,
                Holding.ticker == ticker,
                Holding.game_session_id.is_(None),
            )
            .first()
        )

    def complete_mutation(self) -> None:
        self.db.commit()
        _capture_post_trade_snapshot(take_snapshot, self.db, self.user.id)

    def response_context(self) -> dict:
        return {}


class _SessionPortfolioTradeAdapter:
    """Persist trades against one owned, tradeable Session Portfolio."""

    def __init__(self, db: Session, user: User, session: GameSession):
        self.db = db
        self.user = user
        self.session = session
        self.session_id = session.id

    def prepare_cash(self) -> None:
        ensure_session_cash_initialized(self.session, self.user)

    def prepare_exchange_cash(self) -> None:
        self.prepare_cash()

    def balance(self, currency: str) -> float:
        return self.session.cash_krw if currency == "KRW" else self.session.cash_usd

    def adjust_balance(self, currency: str, amount: float) -> None:
        if currency == "KRW":
            self.session.cash_krw += amount
        else:
            self.session.cash_usd += amount

    def find_buy_holding(self, ticker: str, market: str) -> Holding | None:
        return (
            self.db.query(Holding)
            .filter(
                Holding.user_id == self.user.id,
                Holding.game_session_id == self.session.id,
                Holding.market == market,
                Holding.ticker == ticker,
            )
            .first()
        )

    def find_sell_holding(self, ticker: str) -> Holding | None:
        holdings = (
            self.db.query(Holding)
            .filter(
                Holding.user_id == self.user.id,
                Holding.game_session_id == self.session.id,
                Holding.ticker == ticker,
            )
            .all()
        )
        if len(holdings) > 1:
            markets = sorted({holding.market for holding in holdings})
            if len(markets) > 1:
                raise ValueError(
                    f"Multiple holdings found for {ticker} across markets ({', '.join(markets)}); market is required to sell"
                )
            raise ValueError(
                f"Duplicate holdings found for {ticker}; cannot choose a holding to sell"
            )
        return holdings[0] if holdings else None

    def complete_mutation(self) -> None:
        # User.balance_* remains a migration bridge for legacy callers. Keep
        # the mirror contained in this adapter and in the same pre-commit slot.
        sync_legacy_user_balance(self.user, self.session)
        self.db.commit()
        _capture_post_trade_snapshot(
            take_session_snapshot,
            self.db,
            self.user.id,
            self.session.id,
        )

    def response_context(self) -> dict:
        return {"session_id": self.session.id}


def _trade_storage(
    db: Session,
    user: User,
    session: GameSession | None,
):
    if session is None:
        return _LegacyPortfolioTradeAdapter(db, user)
    return _SessionPortfolioTradeAdapter(db, user, session)


def _trade_response(storage, transaction: dict) -> dict:
    response = {
        "status": "success",
        "transaction": transaction,
        "balance": {
            "krw": storage.balance("KRW"),
            "usd": storage.balance("USD"),
        },
    }
    response.update(storage.response_context())
    return response


def _execute_buy(storage, ticker: str, quantity: int, stock_info: dict) -> dict:
    price = stock_info["price"]
    currency = stock_info["currency"]
    total_cost = price * quantity
    storage.prepare_cash()

    balance = storage.balance(currency)
    if balance < total_cost:
        if currency == "KRW":
            raise ValueError(
                f"Insufficient KRW balance. Need ₩{total_cost:,.0f}, have ₩{balance:,.0f}"
            )
        raise ValueError(
            f"Insufficient USD balance. Need ${total_cost:,.2f}, have ${balance:,.2f}"
        )
    storage.adjust_balance(currency, -total_cost)

    holding = storage.find_buy_holding(ticker, stock_info["market"])
    if holding:
        total_shares = holding.quantity + quantity
        holding.avg_price = ((holding.avg_price * holding.quantity) + (price * quantity)) / total_shares
        holding.quantity = total_shares
    else:
        holding = Holding(
            user_id=storage.user.id,
            game_session_id=storage.session_id,
            ticker=ticker,
            name=stock_info["name"],
            market=stock_info["market"],
            sector=stock_info["sector"],
            industry=stock_info["industry"],
            quantity=quantity,
            avg_price=price,
            currency=currency,
        )
        storage.db.add(holding)

    storage.db.add(
        Transaction(
            user_id=storage.user.id,
            game_session_id=storage.session_id,
            ticker=ticker,
            name=stock_info["name"],
            market=stock_info["market"],
            transaction_type="BUY",
            quantity=quantity,
            price=price,
            currency=currency,
            sector=stock_info["sector"],
            industry=stock_info["industry"],
            total_amount=total_cost,
        )
    )
    storage.complete_mutation()

    return _trade_response(
        storage,
        _transaction_response(
            "BUY", ticker, stock_info["name"], quantity, price, "total_cost", total_cost, currency
        ),
    )


def buy_stock(
    db: Session,
    user_id: int,
    ticker: str,
    quantity: int,
    game_session_id: int | None = None,
) -> dict:
    stock_info = get_stock_info(ticker)
    if not stock_info or stock_info["price"] is None:
        raise ValueError("Could not fetch stock data")

    user = _load_user(db, user_id)
    session = _resolve_trade_session(db, user, game_session_id)
    return _execute_buy(
        _trade_storage(db, user, session),
        ticker,
        quantity,
        stock_info,
    )


def _execute_sell(storage, ticker: str, quantity: int) -> dict:
    holding = storage.find_sell_holding(ticker)
    if not holding:
        info = get_stock_info(ticker)
        name = info["name"] if info else ticker
        raise ValueError(f"You don't own any {name}")
    if holding.quantity < quantity:
        raise ValueError(
            f"Not enough shares of {holding.name or ticker}. Own {holding.quantity}, trying to sell {quantity}"
        )

    price = get_stock_price(ticker)
    if price is None:
        raise ValueError("Could not fetch current price")

    storage.prepare_cash()
    total_proceeds = price * quantity
    realized_pnl = (price - holding.avg_price) * quantity
    storage.adjust_balance(holding.currency, total_proceeds)

    storage.db.add(
        Transaction(
            user_id=storage.user.id,
            game_session_id=storage.session_id,
            ticker=ticker,
            name=holding.name,
            market=holding.market,
            transaction_type="SELL",
            quantity=quantity,
            price=price,
            currency=holding.currency,
            sector=holding.sector,
            industry=holding.industry,
            total_amount=total_proceeds,
            realized_pnl=realized_pnl,
        )
    )
    if holding.quantity == quantity:
        storage.db.delete(holding)
    else:
        holding.quantity -= quantity

    name = holding.name
    currency = holding.currency
    storage.complete_mutation()

    return _trade_response(
        storage,
        _transaction_response(
            "SELL", ticker, name, quantity, price, "total_proceeds", total_proceeds, currency, realized_pnl
        ),
    )


def sell_stock(
    db: Session,
    user_id: int,
    ticker: str,
    quantity: int,
    game_session_id: int | None = None,
) -> dict:
    user = _load_user(db, user_id)
    session = _resolve_trade_session(db, user, game_session_id)
    return _execute_sell(_trade_storage(db, user, session), ticker, quantity)


def _validate_exchange_request(from_currency: str, to_currency: str) -> tuple[str, str]:
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()
    if from_currency == to_currency:
        raise ValueError("Cannot exchange same currency")
    if from_currency not in ("KRW", "USD") or to_currency not in ("KRW", "USD"):
        raise ValueError("Only KRW and USD supported")
    return from_currency, to_currency


def _exchange_rate() -> float:
    try:
        rate = float(get_exchange_rate())
    except (TypeError, ValueError):
        raise ValueError("Could not fetch exchange rate")
    if rate <= 0:
        raise ValueError("Could not fetch exchange rate")
    return rate


def _execute_exchange(
    storage,
    from_currency: str,
    to_currency: str,
    amount: float,
    rate: float,
) -> dict:
    if from_currency == "KRW":
        balance = storage.balance("KRW")
        if balance < amount:
            raise ValueError(f"Insufficient KRW. Have ₩{balance:,.0f}")
        converted = amount / rate
        storage.adjust_balance("KRW", -amount)
        storage.adjust_balance("USD", converted)
    else:
        balance = storage.balance("USD")
        if balance < amount:
            raise ValueError(f"Insufficient USD. Have ${balance:,.2f}")
        converted = amount * rate
        storage.adjust_balance("USD", -amount)
        storage.adjust_balance("KRW", converted)

    storage.db.add(
        _exchange_transaction(
            storage.user.id,
            storage.session_id,
            from_currency,
            to_currency,
            amount,
            rate,
        )
    )
    storage.complete_mutation()

    response = _exchange_response(
        from_currency,
        to_currency,
        amount,
        converted,
        rate,
        storage.balance("KRW"),
        storage.balance("USD"),
    )
    response.update(storage.response_context())
    return response


def _exchange_transaction(user_id, session_id, from_currency, to_currency, amount, rate):
    return Transaction(
        user_id=user_id,
        game_session_id=session_id,
        ticker=f"{from_currency}/{to_currency}",
        name="Currency Exchange",
        market="FX",
        transaction_type="EXCHANGE",
        quantity=1,
        price=rate,
        currency=from_currency,
        sector="Currency",
        industry="Foreign Exchange",
        total_amount=amount,
        realized_pnl=0,
    )


def _exchange_response(from_currency, to_currency, amount, converted, rate, balance_krw, balance_usd):
    return {
        "status": "success",
        "exchange": {
            "from": from_currency,
            "to": to_currency,
            "amount": amount,
            "converted": round(converted, 2),
            "rate": rate,
        },
        "balance": {"krw": balance_krw, "usd": balance_usd},
    }


def exchange_currency(
    db: Session,
    user_id: int,
    from_currency: str,
    to_currency: str,
    amount: float,
    game_session_id: int | None = None,
) -> dict:
    user = _load_user(db, user_id)
    from_currency, to_currency = _validate_exchange_request(from_currency, to_currency)
    session = _resolve_trade_session(db, user, game_session_id)
    storage = _trade_storage(db, user, session)

    # Preserve the legacy/session initialization order around the remote rate
    # lookup. This matters for nullable migration-era cash fields on failures.
    if session is None:
        rate = _exchange_rate()
        storage.prepare_exchange_cash()
    else:
        storage.prepare_exchange_cash()
        rate = _exchange_rate()

    return _execute_exchange(
        storage,
        from_currency,
        to_currency,
        amount,
        rate,
    )
