from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas import BuyRequest, SellRequest, ExchangeRequest
from app.services.trading_service import buy_stock, sell_stock, exchange_currency
from app.auth import get_current_user
from app.models import User

router = APIRouter(tags=["trading"])


@router.post("/trade/buy")
def buy(request: BuyRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        result = buy_stock(db, user_id=current_user.id, ticker=request.ticker, quantity=request.quantity)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/trade/sell")
def sell(request: SellRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        result = sell_stock(db, user_id=current_user.id, ticker=request.ticker, quantity=request.quantity)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/trade/exchange")
def exchange(request: ExchangeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        result = exchange_currency(db, user_id=current_user.id, from_currency=request.from_currency, to_currency=request.to_currency, amount=request.amount)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/game/sessions/{session_id}/trade/buy")
def buy_for_session(
    session_id: int,
    request: BuyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return buy_stock(
            db,
            user_id=current_user.id,
            ticker=request.ticker,
            quantity=request.quantity,
            game_session_id=session_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/game/sessions/{session_id}/trade/sell")
def sell_for_session(
    session_id: int,
    request: SellRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return sell_stock(
            db,
            user_id=current_user.id,
            ticker=request.ticker,
            quantity=request.quantity,
            game_session_id=session_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/game/sessions/{session_id}/trade/exchange")
def exchange_for_session(
    session_id: int,
    request: ExchangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return exchange_currency(
            db,
            user_id=current_user.id,
            from_currency=request.from_currency,
            to_currency=request.to_currency,
            amount=request.amount,
            game_session_id=session_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
