from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Watchlist
from app.services.stock_service import get_stock_info
from app.services.valuation_service import get_prices_for_tickers

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

@router.get("/")
def get_watchlist(user_id: int, db: Session = Depends(get_db)):
    items = db.query(Watchlist).filter(Watchlist.user_id == user_id).all() 
    prices = get_prices_for_tickers([item.ticker for item in items])
    result = []
    for item in items:
        price = prices.get(item.ticker)
        result.append({
            "id": item.id,
            "ticker": item.ticker,
            "name": item.name,
            "market": item.market,
            "price": price,
            "currency": "KRW" if item.market == "KRX" else "USD",
        })
    return result


@router.get("/contains")
def contains_watchlist_item(ticker: str, user_id: int, db: Session = Depends(get_db)):
    item = db.query(Watchlist).filter(
        Watchlist.user_id == user_id,
        Watchlist.ticker == ticker
    ).first()
    return {"ticker": ticker, "in_watchlist": bool(item)}

@router.post("/add")
def add_to_watchlist(ticker: str, user_id: int, db: Session = Depends(get_db)):
    existing = db.query(Watchlist).filter(
        Watchlist.user_id == user_id,
        Watchlist.ticker == ticker
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already in watchlist")

    info = get_stock_info(ticker)
    if not info:
        raise HTTPException(status_code=404, detail="Stock not found")

    item = Watchlist(
        user_id=user_id, 
        ticker=ticker,
        name=info["name"],
        market=info["market"],
    )
    db.add(item)
    db.commit()
    return {"status": "success", "ticker": ticker}

@router.delete("/remove/{ticker}")
def remove_from_watchlist(ticker: str, user_id: int, db: Session = Depends(get_db)): 
    item = db.query(Watchlist).filter(
        Watchlist.user_id == user_id, 
        Watchlist.ticker == ticker
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    db.delete(item)
    db.commit()
    return {"status": "success", "ticker": ticker}