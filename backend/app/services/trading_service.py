import logging

from sqlalchemy.orm import Session

from app.models import Holding, Transaction, User
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
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")
    return user


def _resolve_trade_session(db: Session, user: User, game_session_id: int | None):
    if game_session_id is not None:
        return get_tradeable_session(db, user, game_session_id)
    current_session = get_current_session(db, user)
    if current_session is None:
        return None
    return get_tradeable_session(db, user, current_session.id)


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


def _buy_legacy(db: Session, user: User, ticker: str, quantity: int, stock_info: dict) -> dict:
    price = stock_info["price"]
    currency = stock_info["currency"]
    total_cost = price * quantity

    if currency == "KRW":
        if user.balance_krw < total_cost:
            raise ValueError(
                f"Insufficient KRW balance. Need ₩{total_cost:,.0f}, have ₩{user.balance_krw:,.0f}"
            )
        user.balance_krw -= total_cost
    else:
        if user.balance_usd < total_cost:
            raise ValueError(
                f"Insufficient USD balance. Need ${total_cost:,.2f}, have ${user.balance_usd:,.2f}"
            )
        user.balance_usd -= total_cost

    holding = (
        db.query(Holding)
        .filter(Holding.user_id == user.id, Holding.ticker == ticker)
        .first()
    )
    if holding:
        total_shares = holding.quantity + quantity
        holding.avg_price = ((holding.avg_price * holding.quantity) + (price * quantity)) / total_shares
        holding.quantity = total_shares
    else:
        holding = Holding(
            user_id=user.id,
            ticker=ticker,
            name=stock_info["name"],
            market=stock_info["market"],
            sector=stock_info["sector"],
            industry=stock_info["industry"],
            quantity=quantity,
            avg_price=price,
            currency=currency,
        )
        db.add(holding)

    db.add(
        Transaction(
            user_id=user.id,
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
    db.commit()
    _capture_post_trade_snapshot(take_snapshot, db, user.id)

    return {
        "status": "success",
        "transaction": _transaction_response(
            "BUY", ticker, stock_info["name"], quantity, price, "total_cost", total_cost, currency
        ),
        "balance": {"krw": user.balance_krw, "usd": user.balance_usd},
    }


def _buy_for_session(db: Session, user: User, session, ticker: str, quantity: int, stock_info: dict) -> dict:
    price = stock_info["price"]
    currency = stock_info["currency"]
    total_cost = price * quantity
    ensure_session_cash_initialized(session, user)

    if currency == "KRW":
        if session.cash_krw < total_cost:
            raise ValueError(
                f"Insufficient KRW balance. Need ₩{total_cost:,.0f}, have ₩{session.cash_krw:,.0f}"
            )
        session.cash_krw -= total_cost
    else:
        if session.cash_usd < total_cost:
            raise ValueError(
                f"Insufficient USD balance. Need ${total_cost:,.2f}, have ${session.cash_usd:,.2f}"
            )
        session.cash_usd -= total_cost

    holding = (
        db.query(Holding)
        .filter(
            Holding.user_id == user.id,
            Holding.game_session_id == session.id,
            Holding.market == stock_info["market"],
            Holding.ticker == ticker,
        )
        .first()
    )
    if holding:
        total_shares = holding.quantity + quantity
        holding.avg_price = ((holding.avg_price * holding.quantity) + (price * quantity)) / total_shares
        holding.quantity = total_shares
    else:
        holding = Holding(
            user_id=user.id,
            game_session_id=session.id,
            ticker=ticker,
            name=stock_info["name"],
            market=stock_info["market"],
            sector=stock_info["sector"],
            industry=stock_info["industry"],
            quantity=quantity,
            avg_price=price,
            currency=currency,
        )
        db.add(holding)

    db.add(
        Transaction(
            user_id=user.id,
            game_session_id=session.id,
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
    sync_legacy_user_balance(user, session)
    db.commit()
    _capture_post_trade_snapshot(take_session_snapshot, db, user.id, session.id)

    return {
        "status": "success",
        "transaction": _transaction_response(
            "BUY", ticker, stock_info["name"], quantity, price, "total_cost", total_cost, currency
        ),
        "balance": {"krw": session.cash_krw, "usd": session.cash_usd},
        "session_id": session.id,
    }


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
    if session is None:
        return _buy_legacy(db, user, ticker, quantity, stock_info)
    return _buy_for_session(db, user, session, ticker, quantity, stock_info)


def _sell_legacy(db: Session, user: User, ticker: str, quantity: int) -> dict:
    holding = db.query(Holding).filter(Holding.user_id == user.id, Holding.ticker == ticker).first()
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

    total_proceeds = price * quantity
    realized_pnl = (price - holding.avg_price) * quantity
    if holding.currency == "KRW":
        user.balance_krw += total_proceeds
    else:
        user.balance_usd += total_proceeds

    db.add(
        Transaction(
            user_id=user.id,
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
        db.delete(holding)
    else:
        holding.quantity -= quantity

    name = holding.name
    currency = holding.currency
    db.commit()
    _capture_post_trade_snapshot(take_snapshot, db, user.id)

    return {
        "status": "success",
        "transaction": _transaction_response(
            "SELL", ticker, name, quantity, price, "total_proceeds", total_proceeds, currency, realized_pnl
        ),
        "balance": {"krw": user.balance_krw, "usd": user.balance_usd},
    }


def _sell_for_session(db: Session, user: User, session, ticker: str, quantity: int) -> dict:
    holdings = (
        db.query(Holding)
        .filter(
            Holding.user_id == user.id,
            Holding.game_session_id == session.id,
            Holding.ticker == ticker,
        )
        .all()
    )
    if not holdings:
        info = get_stock_info(ticker)
        name = info["name"] if info else ticker
        raise ValueError(f"You don't own any {name}")

    if len(holdings) > 1:
        markets = sorted({h.market for h in holdings})
        if len(markets) > 1:
            raise ValueError(
                f"Multiple holdings found for {ticker} across markets ({', '.join(markets)}); market is required to sell"
            )
        raise ValueError(f"Duplicate holdings found for {ticker}; cannot choose a holding to sell")

    holding = holdings[0]
    if holding.quantity < quantity:
        raise ValueError(
            f"Not enough shares of {holding.name or ticker}. Own {holding.quantity}, trying to sell {quantity}"
        )

    price = get_stock_price(ticker)
    if price is None:
        raise ValueError("Could not fetch current price")

    ensure_session_cash_initialized(session, user)
    total_proceeds = price * quantity
    realized_pnl = (price - holding.avg_price) * quantity
    if holding.currency == "KRW":
        session.cash_krw += total_proceeds
    else:
        session.cash_usd += total_proceeds

    db.add(
        Transaction(
            user_id=user.id,
            game_session_id=session.id,
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
        db.delete(holding)
    else:
        holding.quantity -= quantity

    name = holding.name
    currency = holding.currency
    sync_legacy_user_balance(user, session)
    db.commit()
    _capture_post_trade_snapshot(take_session_snapshot, db, user.id, session.id)

    return {
        "status": "success",
        "transaction": _transaction_response(
            "SELL", ticker, name, quantity, price, "total_proceeds", total_proceeds, currency, realized_pnl
        ),
        "balance": {"krw": session.cash_krw, "usd": session.cash_usd},
        "session_id": session.id,
    }


def sell_stock(
    db: Session,
    user_id: int,
    ticker: str,
    quantity: int,
    game_session_id: int | None = None,
) -> dict:
    user = _load_user(db, user_id)
    session = _resolve_trade_session(db, user, game_session_id)
    if session is None:
        return _sell_legacy(db, user, ticker, quantity)
    return _sell_for_session(db, user, session, ticker, quantity)


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


def _exchange_legacy(
    db: Session,
    user: User,
    from_currency: str,
    to_currency: str,
    amount: float,
) -> dict:
    rate = _exchange_rate()
    user.balance_krw = user.balance_krw or 0.0
    user.balance_usd = user.balance_usd or 0.0
    if from_currency == "KRW":
        if user.balance_krw < amount:
            raise ValueError(f"Insufficient KRW. Have ₩{user.balance_krw:,.0f}")
        converted = amount / rate
        user.balance_krw -= amount
        user.balance_usd += converted
    else:
        if user.balance_usd < amount:
            raise ValueError(f"Insufficient USD. Have ${user.balance_usd:,.2f}")
        converted = amount * rate
        user.balance_usd -= amount
        user.balance_krw += converted

    db.add(_exchange_transaction(user.id, None, from_currency, to_currency, amount, rate))
    db.commit()
    _capture_post_trade_snapshot(take_snapshot, db, user.id)

    return _exchange_response(from_currency, to_currency, amount, converted, rate, user.balance_krw, user.balance_usd)


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


def _exchange_for_session(
    db: Session,
    user: User,
    session,
    from_currency: str,
    to_currency: str,
    amount: float,
) -> dict:
    ensure_session_cash_initialized(session, user)
    rate = _exchange_rate()
    if from_currency == "KRW":
        if session.cash_krw < amount:
            raise ValueError(f"Insufficient KRW. Have ₩{session.cash_krw:,.0f}")
        converted = amount / rate
        session.cash_krw -= amount
        session.cash_usd += converted
    else:
        if session.cash_usd < amount:
            raise ValueError(f"Insufficient USD. Have ${session.cash_usd:,.2f}")
        converted = amount * rate
        session.cash_usd -= amount
        session.cash_krw += converted

    db.add(_exchange_transaction(user.id, session.id, from_currency, to_currency, amount, rate))
    sync_legacy_user_balance(user, session)
    db.commit()
    _capture_post_trade_snapshot(take_session_snapshot, db, user.id, session.id)

    response = _exchange_response(
        from_currency, to_currency, amount, converted, rate, session.cash_krw, session.cash_usd
    )
    response["session_id"] = session.id
    return response


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
    if session is None:
        return _exchange_legacy(db, user, from_currency, to_currency, amount)
    return _exchange_for_session(db, user, session, from_currency, to_currency, amount)
