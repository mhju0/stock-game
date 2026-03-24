from pydantic import BaseModel


class BuyRequest(BaseModel):
    ticker: str
    quantity: float


class SellRequest(BaseModel):
    ticker: str
    quantity: float


class ExchangeRequest(BaseModel):
    from_currency: str
    to_currency: str
    amount: float