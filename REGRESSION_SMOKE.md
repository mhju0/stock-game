# Regression Smoke

Run this from the repository root before commit/push:

```bash
./scripts/regression-smoke.sh
```

The command uses the existing backend pytest setup with an in-memory database and mocked market data, then runs a dependency-free frontend navigation source check. It does not need production credentials, Supabase access, or live market prices.

## Covered

- Auth register/login through FastAPI routes
- Create throwaway game sessions and list them
- Search stock detail and popular-stock detail API paths
- Watchlist add/remove and global user-level persistence across games
- KRW/USD exchange, buy, sell, account, holdings, transactions, and analytics routes
- Session data isolation between two active games
- Cross-user session access returns 404
- Archived and expired games block trading/exchange
- Delete removes only the selected session's scoped holdings, transactions, and snapshots
- Watchlist and another owned session survive session delete
- Watchlist/Market source code still routes stock clicks to `/games/:sessionId/search?ticker=...`

## Known Limitations

- This is not a browser E2E test. It does not click the real DOM, verify rendered charts, or exercise Vercel/Render/Supabase integration.
- Prices, FX, market ranking, and stock search are mocked in the backend smoke for repeatability.
- The frontend navigation check is source-level. If the implementation is rewritten while preserving behavior, update the check with the new stable pattern.

## Manual QA Checklist

- Log in with a non-production test account.
- Create a throwaway game, confirm it appears in My Games, and open it.
- Add a stock to the watchlist from Search, open it from Watchlist, and confirm the URL is `/games/:sessionId/search?ticker=...`.
- Open a popular Market stock and confirm the same full stock detail route.
- Search a stock directly and confirm detail, chart state, and trade controls load.
- Exchange KRW/USD, buy, sell, then confirm Portfolio, Transactions, and Analytics update.
- Create a second game and confirm holdings/transactions from the first game do not appear there.
- Confirm the watchlist remains visible across both games.
- Archive the throwaway game and confirm trading/exchange are blocked.
- Delete the throwaway game and confirm other games and watchlist items remain.
