from typing import Annotated

from fastapi import Path, Query
from pydantic import BaseModel, Field

# Yahoo symbol shape: letters and digits, plus the dot suffix (005930.KS) and
# hyphen (BRK-B) real symbols use. yfinance interpolates the symbol into a
# request URL, so bound it here rather than at each call site. Search is
# excluded on purpose — it takes free text, not symbols.
TICKER_PATTERN = r"^[A-Za-z0-9.\-]{1,12}$"

TickerPath = Annotated[str, Path(pattern=TICKER_PATTERN)]
TickerQuery = Annotated[str, Query(pattern=TICKER_PATTERN)]

# Python integers are unbounded, so a floor alone lets a caller send a value with
# hundreds of digits; multiplying that by a float price raises OverflowError in
# the handler. Set far above any share count a real portfolio could hold.
MAX_TRADE_QUANTITY = 1_000_000_000


class BuyRequest(BaseModel):
    ticker: str = Field(pattern=TICKER_PATTERN)
    quantity: int = Field(gt=0, le=MAX_TRADE_QUANTITY)


class SellRequest(BaseModel):
    ticker: str = Field(pattern=TICKER_PATTERN)
    quantity: int = Field(gt=0, le=MAX_TRADE_QUANTITY)


class ExchangeRequest(BaseModel):
    from_currency: str
    to_currency: str
    amount: float = Field(gt=0, allow_inf_nan=False)


class NewGameRequest(BaseModel):
    starting_balance_krw: float = Field(default=10_000_000, gt=0, allow_inf_nan=False)
    duration_days: int = Field(default=90, gt=0)


class GameSessionCreateRequest(BaseModel):
    title: str | None = None
    duration_days: int = Field(default=90, gt=0)
    starting_balance_krw: float = Field(default=10_000_000, gt=0, allow_inf_nan=False)
    starting_balance_usd: float = Field(default=0.0, ge=0, allow_inf_nan=False)


class GameSessionUpdateRequest(BaseModel):
    title: str | None = None
    status: str | None = None
