import math


def realized_performance(sells) -> dict:
    available = all(t.realized_pnl is not None and math.isfinite(t.realized_pnl) for t in sells)
    by_currency = {}
    for trade in sells:
        if trade.realized_pnl is not None and math.isfinite(trade.realized_pnl):
            by_currency[trade.currency] = by_currency.get(trade.currency, 0.0) + trade.realized_pnl
    comparable = available and len({t.currency for t in sells}) <= 1
    wins = [t for t in sells if t.realized_pnl is not None and t.realized_pnl > 0]
    losses = [t for t in sells if t.realized_pnl is not None and t.realized_pnl < 0]

    def trade_result(trade):
        return {"ticker": trade.ticker, "name": trade.name, "pnl": trade.realized_pnl, "currency": trade.currency}

    return {
        "total_realized_pnl": round(sum(by_currency.values()), 2) if comparable else None,
        "realized_pnl_by_currency": {currency: round(amount, 2) for currency, amount in sorted(by_currency.items())},
        "realized_pnl_available": available,
        "realized_pnl_unavailable_reason": None if available else "missing_sell_realized_pnl",
        "trade_comparison_unavailable_reason": ("missing_sell_realized_pnl" if not available else "mixed_realized_pnl_currencies") if not comparable else None,
        "total_trades": len(sells),
        "winning_trades": len(wins) if available else None,
        "losing_trades": len(losses) if available else None,
        "win_rate": (round(len(wins) / len(sells) * 100, 2) if sells else 0) if available else None,
        "best_trade": trade_result(max(sells, key=lambda t: t.realized_pnl)) if sells and comparable else None,
        "worst_trade": trade_result(min(sells, key=lambda t: t.realized_pnl)) if sells and comparable else None,
    }
