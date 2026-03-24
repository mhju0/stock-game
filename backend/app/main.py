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
        db = SessionLocal()
        try:
            take_snapshot(db, user_id=1)
            print("Portfolio snapshot saved")
        except Exception as e:
            print(f"Snapshot error: {e}")
        finally:
            db.close()


async def market_refresh_loop():
    while True:
        await asyncio.sleep(6 * 3600)
        thread = threading.Thread(target=schedule_refresh)
        thread.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    existing = db.query(models.User).filter(models.User.id == 1).first()
    if not existing:
        user = models.User(username="player1", balance_krw=10_000_000, balance_usd=0.0)
        db.add(user)
        db.commit()
    db.close()

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

app.include_router(trading_router)
app.include_router(portfolio_router)
app.include_router(watchlist_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(game_router)


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
        if data.empty:
            return []
        result = []
        for date, row in data.iterrows():
            result.append(
                {
                    "date": date.strftime("%Y-%m-%d"),
                    "open": round(float(row["Open"]), 2),
                    "high": round(float(row["High"]), 2),
                    "low": round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]),
                }
            )
        return result
    except Exception:
        return []


@app.get("/stock/{ticker}")
def stock_info(ticker: str):
    info = get_stock_info(ticker)
    if not info:
        return {"error": "Stock not found"}
    return info


@app.get("/stock/search/{query}")
def stock_search(query: str):
    results = search_stocks(query)
    return results


@app.get("/exchange-rate")
def exchange_rate():
    rate = get_exchange_rate()
    return {"usd_to_krw": rate}


@app.get("/market/top30/{market}")
def top_30(market: str):
    if market.upper() not in ("US", "KR"):
        return {"error": "Market must be US or KR"}
    return get_top_30(market.upper())


@app.post("/portfolio/snapshot")
def manual_snapshot():
    db = SessionLocal()
    try:
        snapshot = take_snapshot(db, user_id=1)
        return {"status": "success", "total_value_krw": snapshot.total_value_krw}
    finally:
        db.close()
