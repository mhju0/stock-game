from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Holding, Transaction, PortfolioSnapshot, GameSession
from app.services.stock_service import get_stock_price, get_stock_info # <-- Added get_stock_info
from app.services.exchange_service import get_exchange_rate

router = APIRouter(prefix="/analytics", tags=["analytics"])

def get_starting_value(db: Session, user_id: int) -> float:
    session = db.query(GameSession).filter(
        GameSession.user_id == user_id,
        GameSession.is_active == True
    ).first()
    return session.starting_balance_krw if session else 10_000_000

@router.get("/performance")
def get_performance(user_id: int, db: Session = Depends(get_db)):
    snapshots = db.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.user_id == user_id
    ).order_by(PortfolioSnapshot.created_at.asc()).all()

    starting_value = get_starting_value(db, user_id)
    current = snapshots[-1].total_value_krw if snapshots else starting_value
    total_return = current - starting_value
    total_return_pct = (total_return / starting_value) * 100 if starting_value else 0

    return {
        "starting_value": starting_value,
        "current_value": round(current, 2),
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "snapshots": [
            {
                "date": s.created_at.isoformat(),
                "value": round(s.total_value_krw, 2),
                "holdings_value": round(s.total_holdings_value_krw, 2),
                "cash_krw": round(s.cash_krw, 2),
                "cash_usd": round(s.cash_usd, 2),
            }
            for s in snapshots
        ],
    }

@router.get("/by-stock")
def performance_by_stock(user_id: int, db: Session = Depends(get_db)):
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    rate = get_exchange_rate()

    results = []
    for h in holdings:
        current_price = get_stock_price(h.ticker)
        if not current_price:
            continue
            
        info = get_stock_info(h.ticker) or {}
        market_cap = info.get("marketCap", 0)
        
        unrealized_pnl = (current_price - h.avg_price) * h.quantity
        pnl_pct = ((current_price - h.avg_price) / h.avg_price) * 100 if h.avg_price else 0
        total_value = current_price * h.quantity
        total_value_krw = total_value * rate if h.currency == "USD" else total_value

        results.append({
            "ticker": h.ticker,
            "name": h.name,
            "market": h.market,
            "sector": h.sector,
            "industry": h.industry,
            "currency": h.currency,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "current_price": current_price,
            "total_value": round(total_value, 2),
            "total_value_krw": round(total_value_krw, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "unrealized_pnl_pct": round(pnl_pct, 2),
            "market_cap": market_cap, # <-- Added to response
        })

    # Default sort
    results.sort(key=lambda x: x["unrealized_pnl_pct"], reverse=True)
    return results

@router.get("/by-sector")
def performance_by_sector(user_id: int, db: Session = Depends(get_db)):
    holdings = db.query(Holding).filter(Holding.user_id == user_id).all()
    rate = get_exchange_rate()

    sectors = {}
    for h in holdings:
        current_price = get_stock_price(h.ticker)
        if not current_price:
            continue

        total_value = current_price * h.quantity
        total_value_krw = total_value * rate if h.currency == "USD" else total_value
        cost_value = h.avg_price * h.quantity
        cost_value_krw = cost_value * rate if h.currency == "USD" else cost_value
        unrealized_pnl_krw = total_value_krw - cost_value_krw

        sector = h.sector or "Unknown"
        if sector not in sectors:
            sectors[sector] = {"total_value_krw": 0, "cost_krw": 0, "pnl_krw": 0, "count": 0, "stocks": []}

        sectors[sector]["total_value_krw"] += total_value_krw
        sectors[sector]["cost_krw"] += cost_value_krw
        sectors[sector]["pnl_krw"] += unrealized_pnl_krw
        sectors[sector]["count"] += 1
        sectors[sector]["stocks"].append(h.ticker)

    total_portfolio_krw = sum(s["total_value_krw"] for s in sectors.values())

    results = []
    for name, data in sectors.items():
        pnl_pct = (data["pnl_krw"] / data["cost_krw"] * 100) if data["cost_krw"] else 0
        allocation_pct = (data["total_value_krw"] / total_portfolio_krw * 100) if total_portfolio_krw else 0
        results.append({
            "sector": name,
            "total_value_krw": round(data["total_value_krw"], 2),
            "pnl_krw": round(data["pnl_krw"], 2),
            "pnl_pct": round(pnl_pct, 2),
            "allocation_pct": round(allocation_pct, 2),
            "stock_count": data["count"],
            "stocks": data["stocks"],
        })

    results.sort(key=lambda x: x["total_value_krw"], reverse=True)
    return results

@router.get("/realized")
def realized_performance(user_id: int, db: Session = Depends(get_db)):
    sells = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.transaction_type == "SELL"
    ).order_by(Transaction.created_at.desc()).all()

    total_realized = sum(t.realized_pnl for t in sells)
    wins = [t for t in sells if t.realized_pnl > 0]
    losses = [t for t in sells if t.realized_pnl < 0]

    return {
        "total_realized_pnl": round(total_realized, 2),
        "total_trades": len(sells),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(len(wins) / len(sells) * 100, 2) if sells else 0,
        "best_trade": {
            "ticker": max(sells, key=lambda t: t.realized_pnl).ticker,
            "pnl": max(sells, key=lambda t: t.realized_pnl).realized_pnl,
        } if sells else None,
        "worst_trade": {
            "ticker": min(sells, key=lambda t: t.realized_pnl).ticker,
            "pnl": min(sells, key=lambda t: t.realized_pnl).realized_pnl,
        } if sells else None,
    }