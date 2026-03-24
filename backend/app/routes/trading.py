from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import BuyRequest, SellRequest, ExchangeRequest
from app.services.trading_service import buy_stock, sell_stock, exchange_currency

router = APIRouter(prefix="/trade", tags=["trading"])


@router.post("/buy")
def buy(request: BuyRequest, user_id: int, db: Session = Depends(get_db)): # Added user_id
    try:
        # Pass the dynamic user_id to the service instead of 1
        result = buy_stock(db, user_id=user_id, ticker=request.ticker, quantity=request.quantity)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sell")
def sell(request: SellRequest, user_id: int, db: Session = Depends(get_db)): # Added user_id
    try:
        # Pass the dynamic user_id to the service instead of 1
        result = sell_stock(db, user_id=user_id, ticker=request.ticker, quantity=request.quantity)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/exchange")
def exchange(request: ExchangeRequest, user_id: int, db: Session = Depends(get_db)): # Added user_id
    try:
        # Pass the dynamic user_id to the service instead of 1
        result = exchange_currency(db, user_id=user_id, from_currency=request.from_currency, to_currency=request.to_currency, amount=request.amount)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))