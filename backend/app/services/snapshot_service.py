from sqlalchemy.orm import Session
from app.models import User, Holding, PortfolioSnapshot
from app.services.stock_service import get_stock_price
from app.services.exchange_service import get_exchange_rate


def take_snapshot(db: Session, user_id: int) -> PortfolioSnapshot:
    user = db.query(User).filter(User.id == user_id).first()
    rate = get_exchange_rate()

    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    holdings_value_krw = 0.0
    for h in holdings:
        price = get_stock_price(h.ticker)
        if price:
            value = price * h.quantity
            if h.currency == "USD":
                value *= rate
            holdings_value_krw += value

    total_value_krw = user.balance_krw + (user.balance_usd * rate) + holdings_value_krw

    snapshot = PortfolioSnapshot(
        user_id=user_id,
        total_value_krw=round(total_value_krw, 2),
        total_holdings_value_krw=round(holdings_value_krw, 2),
        cash_krw=user.balance_krw,
        cash_usd=user.balance_usd,
        exchange_rate=rate,
    )
    db.add(snapshot)
    db.commit()
    return snapshot