from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
import asyncio
import fcntl
import threading
import time
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import engine, SessionLocal, Base, get_db
from app import models
from app.routes.auth import router as auth_router
from app.routes.trading import router as trading_router
from app.routes.portfolio import router as portfolio_router
from app.routes.watchlist import router as watchlist_router
from app.routes.admin import router as admin_router
from app.routes.analytics import router as analytics_router
from app.routes.game import router as game_router
from app.routes.users import router as users_router
from app.routes.stocks import router as stocks_router
from app.services.market_service import schedule_refresh
from app.services.snapshot_service import run_snapshot_batch
from app.services.seed_service import seed_demo

import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _init_db_with_retry(attempts: int = 3, delay: float = 5.0) -> None:
    """Create tables at startup, retrying briefly so a momentarily unreachable
    DB (paused Supabase, transient SSL blip) doesn't crash-loop the worker at
    boot. Production tables already exist, so this is a no-op there."""
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            models.Base.metadata.create_all(bind=engine)
            return
        except Exception as e:  # pragma: no cover - exercised only on DB outage
            last_err = e
            logger.warning("DB init attempt %d/%d failed: %s", attempt, attempts, e)
            if attempt < attempts:
                time.sleep(delay)
    logger.critical("Database unreachable after %d attempts: %s", attempts, last_err)
    raise last_err


DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]


def resolve_allowed_origins(env) -> list[str]:
    """CORS origins for this environment.

    FRONTEND_URL is set only on the deployed backend (render.yaml declares it
    sync:false), so its absence means local dev. Keeping the dev-server origins
    out of the deployed allowlist stops a page on a developer's own machine
    from calling production.
    """
    frontend_url = env.get("FRONTEND_URL")
    if frontend_url:
        return [frontend_url]
    return list(DEV_ORIGINS)


ALLOWED_ORIGINS = resolve_allowed_origins(os.environ)


async def snapshot_loop():
    while True:
        await asyncio.sleep(3600)
        # Run the entire snapshot batch in a thread so yfinance
        # HTTP calls don't block the FastAPI event loop
        def _take_all_snapshots():
            db = SessionLocal()
            try:
                run_snapshot_batch(db)
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
    # Create tables at startup (with retry) instead of at import time, so a
    # brief DB outage doesn't crash the worker before it can even boot.
    _init_db_with_retry()

    # Create-or-reset the public demo account to its baseline on every boot,
    # so reviewers always land on a pristine portfolio regardless of what a
    # previous visitor did. Wrapped so a seed failure can never block startup.
    db = SessionLocal()
    try:
        seed_demo(db)
    except Exception as e:
        logger.warning("Demo seed skipped: %s", e)
    finally:
        db.close()

    # Under multi-worker deployments (gunicorn -w N) each worker process runs
    # this lifespan independently. Gate all background tasks to a single worker
    # via a non-blocking exclusive flock; other workers skip silently.
    _lock_fd = None
    is_scheduler = False
    try:
        _lock_fd = open("/tmp/stock_game_scheduler.lock", "w")
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        is_scheduler = True
    except OSError:
        if _lock_fd:
            _lock_fd.close()
            _lock_fd = None

    if is_scheduler:
        thread = threading.Thread(target=schedule_refresh)
        thread.start()

    snapshot_task = asyncio.create_task(snapshot_loop()) if is_scheduler else None
    refresh_task = asyncio.create_task(market_refresh_loop()) if is_scheduler else None

    yield

    if snapshot_task:
        snapshot_task.cancel()
    if refresh_task:
        refresh_task.cancel()
    if _lock_fd:
        fcntl.flock(_lock_fd, fcntl.LOCK_UN)
        _lock_fd.close()


def resolve_doc_urls(env) -> dict:
    """Interactive docs enumerate every route, including /admin/*.

    Serve them only where ENABLE_DEV_TOOLS already marks a developer
    environment, matching the gate app/routes/admin.py uses. Fails closed on an
    absent or unexpected value.
    """
    if env.get("ENABLE_DEV_TOOLS", "").lower() == "true":
        return {
            "docs_url": "/docs",
            "redoc_url": "/redoc",
            "openapi_url": "/openapi.json",
        }
    return {"docs_url": None, "redoc_url": None, "openapi_url": None}


app = FastAPI(
    title="Stock Game API",
    lifespan=lifespan,
    **resolve_doc_urls(os.environ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # The API authenticates with a Bearer header from localStorage, never a
    # cookie, so credentialed cross-origin requests need no sanction.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Registered after CORS so it is the outermost layer and stamps every response,
# including preflights and error paths. Browsers ignore HSTS delivered over
# plain HTTP (RFC 6797 s8.1), so it is inert in local dev and needs no env gate.
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


app.include_router(auth_router)
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


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    """Readiness + keep-alive probe: runs a real query so an external cron can
    wake Render and keep Supabase from pausing in one call."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as e:
        logger.warning("DB health check failed: %s", e)
        raise HTTPException(status_code=503, detail="database unavailable")
