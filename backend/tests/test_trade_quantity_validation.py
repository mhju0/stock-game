"""Trade quantity must be a whole number of shares.

The frontend already treats whole shares as the contract (TradeModal's
isWholeQuantity check), but the API accepted fractions, so a direct API caller
could open sub-share positions the UI can never represent.
"""

import pytest
from pydantic import ValidationError

from app.schemas import BuyRequest, SellRequest

FRACTIONAL = [0.5, 1.5, 0.000001]


@pytest.mark.parametrize("quantity", FRACTIONAL)
def test_buy_schema_rejects_fractional_quantity(quantity):
    with pytest.raises(ValidationError):
        BuyRequest(ticker="AAPL", quantity=quantity)


@pytest.mark.parametrize("quantity", FRACTIONAL)
def test_sell_schema_rejects_fractional_quantity(quantity):
    with pytest.raises(ValidationError):
        SellRequest(ticker="AAPL", quantity=quantity)


def test_whole_quantities_still_accepted():
    assert BuyRequest(ticker="AAPL", quantity=3).quantity == 3
    # JSON numbers arrive as floats; a whole-valued float is still whole shares.
    assert SellRequest(ticker="AAPL", quantity=3.0).quantity == 3


def test_buy_endpoint_rejects_fractional_quantity(client, auth_headers):
    resp = client.post(
        "/trade/buy",
        json={"ticker": "AAPL", "quantity": 0.5},
        headers=auth_headers,
    )
    assert resp.status_code == 422
