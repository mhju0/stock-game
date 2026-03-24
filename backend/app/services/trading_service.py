from sqlalchemy.orm import Session
from app.models import User, Holding, Transaction
from app.services.stock_service import get_stock_price, get_stock_info
from app.services.exchange_service import get_exchange_rate
from app.services.snapshot_service import take_snapshot



def buy_stock(db: Session, user_id: int, ticker: str, quantity: int) -> dict:
    stock_info = get_stock_info(ticker)
    if not stock_info or stock_info["price"] is None:
        raise ValueError("Could not fetch stock data")

    price = stock_info["price"]
    currency = stock_info["currency"]
    total_cost = price * quantity

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

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
        .filter(Holding.user_id == user_id, Holding.ticker == ticker)
        .first()
    )

    if holding:
        total_shares = holding.quantity + quantity
        holding.avg_price = (
            (holding.avg_price * holding.quantity) + (price * quantity)
        ) / total_shares
        holding.quantity = total_shares
    else:
        holding = Holding(
            user_id=user_id,
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

    transaction = Transaction(
        user_id=user_id,
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
    db.add(transaction)
    db.commit()
    take_snapshot(db, user_id)

    return {
        "status": "success",
        "transaction": {
            "type": "BUY",
            "ticker": ticker,
            "name": stock_info["name"],
            "quantity": quantity,
            "price": price,
            "total_cost": total_cost,
            "currency": currency,
        },
        "balance": {
            "krw": user.balance_krw,
            "usd": user.balance_usd,
        },
    }


def sell_stock(db: Session, user_id: int, ticker: str, quantity: int) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    holding = (
        db.query(Holding)
        .filter(Holding.user_id == user_id, Holding.ticker == ticker)
        .first()
    )

    if not holding:
        raise ValueError(f"You don't own any {ticker}")
    if holding.quantity < quantity:
        raise ValueError(
            f"Not enough shares. Own {holding.quantity}, trying to sell {quantity}"
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

    transaction = Transaction(
        user_id=user_id,
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
    db.add(transaction)

    if holding.quantity == quantity:
        db.delete(holding)
    else:
        holding.quantity -= quantity

    db.commit()
    take_snapshot(db, user_id)

    return {
        "status": "success",
        "transaction": {
            "type": "SELL",
            "ticker": ticker,
            "name": holding.name,
            "quantity": quantity,
            "price": price,
            "total_proceeds": total_proceeds,
            "realized_pnl": realized_pnl,
            "currency": holding.currency,
        },
        "balance": {
            "krw": user.balance_krw,
            "usd": user.balance_usd,
        },
    }


def exchange_currency(
    db: Session, user_id: int, from_currency: str, to_currency: str, amount: float
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    from_currency = from_currency.upper()
    to_currency = to_currency.upper()

    if from_currency == to_currency:
        raise ValueError("Cannot exchange same currency")
    if from_currency not in ("KRW", "USD") or to_currency not in ("KRW", "USD"):
        raise ValueError("Only KRW and USD supported")

    rate = get_exchange_rate()

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

    transaction = Transaction(
        user_id=user_id,
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
    db.add(transaction)
    db.commit()
    take_snapshot(db, user_id)

    return {
        "status": "success",
        "exchange": {
            "from": from_currency,
            "to": to_currency,
            "amount": amount,
            "converted": round(converted, 2),
            "rate": rate,
        },
        "balance": {
            "krw": user.balance_krw,
            "usd": user.balance_usd,
        },
    }
