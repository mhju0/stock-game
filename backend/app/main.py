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
from app.routes.analytics import router as analytics_router
from app.routes.game import router as game_router
from app.routes.users import router as users_router
from app.routes.stocks import router as stocks_router
from app.services.market_service import schedule_refresh
from app.services.snapshot_service import take_snapshot

import os

models.Base.metadata.create_all(bind=engine)

# CORS: allow localhost for dev, plus any production frontend URL
ALLOWED_ORIGINS = [
    "http://localhost:5173",
]
if os.environ.get("FRONTEND_URL"):
    ALLOWED_ORIGINS.append(os.environ["FRONTEND_URL"])


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
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(stocks_router)
app.include_router(trading_router)
app.include_router(portfolio_router)
app.include_router(watchlist_router)
app.include_router(admin_router)
app.include_router(analytics_router)
app.include_router(game_router)


@app.get("/")
def root():
    return {"message": "Stock Game API is running"}
