import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, GameSession, PortfolioSnapshot
from app.auth import get_current_user
from app.services.exchange_service import get_exchange_rate

router = APIRouter(prefix="/admin", tags=["admin"])

class FundsRequest(BaseModel):
    currency: str
    amount: float = Field(gt=0, allow_inf_nan=False)

def require_dev_tools_enabled():
    if os.environ.get("ENABLE_DEV_TOOLS", "").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")

@router.post("/add-funds")
def add_funds(request: FundsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_dev_tools_enabled()
    user_id = current_user.id
    user = current_user

    session = db.query(GameSession).filter(
        GameSession.user_id == user_id,
        GameSession.is_active == True
    ).first()
    rate = get_exchange_rate()

    snapshots = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).all()
        
    if request.currency.upper() == "KRW":
        user.balance_krw += request.amount
        if session:
            session.starting_balance_krw += request.amount
        # Time travel: Update all past snapshots to reflect the new cash baseline
        for s in snapshots:
            s.cash_krw += request.amount
            s.total_value_krw += request.amount
            
    elif request.currency.upper() == "USD":
        user.balance_usd += request.amount
        if session:
            session.starting_balance_krw += (request.amount * rate)
        # Time travel: Update all past USD snapshots using their historical exchange rates
        for s in snapshots:
            s.cash_usd += request.amount
            s.total_value_krw += (request.amount * s.exchange_rate)
            
    else:
        raise HTTPException(status_code=400, detail="Only KRW and USD supported")
        
    db.commit()
    return {
        "status": "success",
        "added": request.amount,
        "currency": request.currency.upper(),
        "balance": {"krw": user.balance_krw, "usd": user.balance_usd},
    }

@router.post("/remove-funds")
def remove_funds(request: FundsRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_dev_tools_enabled()
    user_id = current_user.id
    user = current_user

    session = db.query(GameSession).filter(
        GameSession.user_id == user_id,
        GameSession.is_active == True
    ).first()
    rate = get_exchange_rate()

    snapshots = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).all()
        
    if request.currency.upper() == "KRW":
        if user.balance_krw < request.amount:
            raise HTTPException(status_code=400, detail="Not enough KRW")
        user.balance_krw -= request.amount
        if session:
            session.starting_balance_krw -= request.amount
        # Time travel: Reduce past baselines so percentages don't plummet
        for s in snapshots:
            s.cash_krw -= request.amount
            s.total_value_krw -= request.amount
            
    elif request.currency.upper() == "USD":
        if user.balance_usd < request.amount:
            raise HTTPException(status_code=400, detail="Not enough USD")
        user.balance_usd -= request.amount
        if session:
            session.starting_balance_krw -= (request.amount * rate)
        # Time travel: Reduce past USD baselines
        for s in snapshots:
            s.cash_usd -= request.amount
            s.total_value_krw -= (request.amount * s.exchange_rate)
            
    else:
        raise HTTPException(status_code=400, detail="Only KRW and USD supported")
        
    db.commit()
    return {
        "status": "success",
        "removed": request.amount,
        "currency": request.currency.upper(),
        "balance": {"krw": user.balance_krw, "usd": user.balance_usd},
    }
