from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import User, Holding, Transaction, Watchlist, PortfolioSnapshot, GameSession

from app.services.game_session_service import lock_user_for_mutation

router = APIRouter(tags=["users"])


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only delete your own account")
    user = lock_user_for_mutation(db, user_id)
    db.query(Holding).filter(Holding.user_id == user_id).delete()
    db.query(Transaction).filter(Transaction.user_id == user_id).delete()
    db.query(Watchlist).filter(Watchlist.user_id == user_id).delete()
    db.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete()
    db.query(GameSession).filter(GameSession.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"status": "success"}
