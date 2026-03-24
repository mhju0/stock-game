from contextlib import asynccontextmanager
import asyncio
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, SessionLocal, Base
from app import models
from app.routes.trading import router as trading_router
from app.routes.portfolio import router as portfolio_router
from app.routes.watchlist import router as watchlist_router
from app.routes.admin import router as admin_router
from app.services.stock_service import get_stock_price, get_stock_info, search_stocks
from app.services.exchange_service import get_exchange_rate
from app.services.market_service import get_top_30, schedule_refresh
from app.services.snapshot_service import take_snapshot
from app.routes.analytics import router as analytics_router
from app.routes.game import router as game_router

models.Base.metadata.create_all(bind=engine)

async def snapshot_loop():
    while True:
        await asyncio.sleep(3600)
        # Run the entire snapshot batch in a thread so yfinance
        # HTTP calls don't block the FastAPI event loop
        def _take_all_snapshots():
            db = SessionLocal()
            try:
                users = db.query(models.User).all()
                for user in users:
                    take_snapshot(db, user_id=user.id)
                print(f"Portfolio snapshots saved for {len(users)} users")
            except Exception as e:
                print(f"Snapshot error: {e}")
            finally:
                db.close()

        await asyncio.to_thread(_take_all_snapshots)

async def market_refresh_loop():
    while True:
        await asyncio.sleep(6 * 3600)
        thread = threading.Thread(target=schedule_refresh)
        thread.start()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the market background tasks
    thread = threading.Thread(target=schedule_refresh)
    thread.start()

    snapshot_task = asyncio.create_task(snapshot_loop())
    refresh_task = asyncio.create_task(market_refresh_loop())
    
    yield
    
    snapshot_task.cancel()
    refresh_task.cancel()

app = FastAPI(title="Stock Game API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all the user-aware routes we just built!
app.include_router(trading_router)
app.include_router(portfolio_router)
app.include_router(watchlist_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(game_router)

# Added a quick users endpoint directly in main.py so ProfileSelect.jsx works
from pydantic import BaseModel
class UserCreate(BaseModel):
    username: str

@app.get("/users")
def get_users():
    db = SessionLocal()
    try:
        users = db.query(models.User).all()
        return [{"id": u.id, "username": u.username, "balance_krw": u.balance_krw} for u in users]
    finally:
        db.close()

@app.post("/users/new")
def create_user(user_data: UserCreate):
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.username == user_data.username).first()
        if existing:
            return {"error": "Username already taken"}
        new_user = models.User(username=user_data.username)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {"id": new_user.id, "username": new_user.username}
    finally:
        db.close()

@app.delete("/users/{user_id}")
def delete_user(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            return {"error": "User not found"}
        db.query(models.Holding).filter(models.Holding.user_id == user_id).delete()
        db.query(models.Transaction).filter(models.Transaction.user_id == user_id).delete()
        db.query(models.Watchlist).filter(models.Watchlist.user_id == user_id).delete()
        db.query(models.PortfolioSnapshot).filter(models.PortfolioSnapshot.user_id == user_id).delete()
        db.query(models.GameSession).filter(models.GameSession.user_id == user_id).delete()
        db.delete(user)
        db.commit()
        return {"status": "success"}
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "Stock Game API is running"}

@app.get("/stock/{ticker}/history")
def stock_history(ticker: str, period: str = "1mo"):
    import yfinance as yf
    valid_periods = {"1d": "1d", "1w": "5d", "1mo": "1mo", "3mo": "3mo", "1y": "1y"}
    yf_period = valid_periods.get(period, "1mo")
    try:
        stock = yf.Ticker(ticker)
        data = stock.history(period=yf_period)
        if data.empty: return []
        result = []
        for date, row in data.iterrows():
            result.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            })
        return result
    except Exception:
        return []

@app.get("/stock/{ticker}")
def stock_info(ticker: str):
    info = get_stock_info(ticker)
    if not info: return {"error": "Stock not found"}
    return info

@app.get("/stock/search/{query}")
def stock_search(query: str):
    return search_stocks(query)

@app.get("/exchange-rate")
def exchange_rate():
    return {"usd_to_krw": get_exchange_rate()}

@app.get("/market/top30/{market}")
def top_30(market: str):
    if market.upper() not in ("US", "KR"): return {"error": "Market must be US or KR"}
    return get_top_30(market.upper())