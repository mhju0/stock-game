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
