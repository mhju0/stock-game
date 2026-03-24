from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Holding, Transaction, Watchlist, PortfolioSnapshot, GameSession

router = APIRouter(tags=["users"])


class UserCreate(BaseModel):
    username: str


@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "balance_krw": u.balance_krw} for u in users]


@router.post("/users/new")
def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")
    new_user = User(username=user_data.username)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(Holding).filter(Holding.user_id == user_id).delete()
    db.query(Transaction).filter(Transaction.user_id == user_id).delete()
    db.query(Watchlist).filter(Watchlist.user_id == user_id).delete()
    db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete()
    db.query(GameSession).filter(GameSession.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"status": "success"}
