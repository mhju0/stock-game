from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import User, Holding, Transaction, Watchlist, PortfolioSnapshot, GameSession

router = APIRouter(tags=["users"])


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own account")
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
