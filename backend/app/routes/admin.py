from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/admin", tags=["admin"])


class FundsRequest(BaseModel):
    currency: str
    amount: float


@router.post("/add-funds")
def add_funds(request: FundsRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == 1).first()
    if request.currency.upper() == "KRW":
        user.balance_krw += request.amount
    elif request.currency.upper() == "USD":
        user.balance_usd += request.amount
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
def remove_funds(request: FundsRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == 1).first()
    if request.currency.upper() == "KRW":
        if user.balance_krw < request.amount:
            raise HTTPException(status_code=400, detail="Not enough KRW")
        user.balance_krw -= request.amount
    elif request.currency.upper() == "USD":
        if user.balance_usd < request.amount:
            raise HTTPException(status_code=400, detail="Not enough USD")
        user.balance_usd -= request.amount
    else:
        raise HTTPException(status_code=400, detail="Only KRW and USD supported")
    db.commit()
    return {
        "status": "success",
        "removed": request.amount,
        "currency": request.currency.upper(),
        "balance": {"krw": user.balance_krw, "usd": user.balance_usd},
    }