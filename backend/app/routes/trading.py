from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import BuyRequest, SellRequest, ExchangeRequest
from app.services.trading_service import buy_stock, sell_stock, exchange_currency

router = APIRouter(prefix="/trade", tags=["trading"])


@router.post("/buy")
def buy(request: BuyRequest, db: Session = Depends(get_db)):
    try:
        result = buy_stock(db, user_id=1, ticker=request.ticker, quantity=request.quantity)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sell")
def sell(request: SellRequest, db: Session = Depends(get_db)):
    try:
        result = sell_stock(db, user_id=1, ticker=request.ticker, quantity=request.quantity)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/exchange")
def exchange(request: ExchangeRequest, db: Session = Depends(get_db)):
    try:
        result = exchange_currency(db, user_id=1, from_currency=request.from_currency, to_currency=request.to_currency, amount=request.amount)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))