from pydantic import BaseModel, Field


class BuyRequest(BaseModel):
    ticker: str
    quantity: float = Field(gt=0)


class SellRequest(BaseModel):
    ticker: str
    quantity: float = Field(gt=0)


class ExchangeRequest(BaseModel):
    from_currency: str
    to_currency: str
    amount: float = Field(gt=0)


class NewGameRequest(BaseModel):
    starting_balance_krw: float = Field(default=10_000_000, gt=0)
    duration_days: int = Field(default=90, gt=0)


class GameSessionCreateRequest(BaseModel):
    title: str | None = None
    duration_days: int = Field(default=90, gt=0)
    starting_balance_krw: float = Field(default=10_000_000, gt=0)
    starting_balance_usd: float = Field(default=0.0, ge=0)
