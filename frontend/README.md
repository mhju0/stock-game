# Stock Game — Frontend

The React 19 + Vite client for [Stock Game](../README.md). It covers the entire UI of the paper-trading simulator: auth, trading, portfolio, analytics, and game sessions.

## Tech stack

- **React 19** + **Vite 8** (HMR, `@vitejs/plugin-react`)
- **React Router 7** — routing with an auth guard (`RequireAuth`)
- **TanStack Query (React Query)** — server-state caching / invalidation
- **Recharts** — return, allocation, and price charts
- **react-i18next** — Korean / English localization (`src/i18n/`, defaults to `ko`)
- **jwt-decode** — identifies the user from the JWT in localStorage

## Development

```bash
npm install
echo "VITE_API_URL=http://127.0.0.1:8000" > .env.local   # defaults to 127.0.0.1:8000 if unset
npm run dev      # http://localhost:5173
```

| Script | Description |
|---|---|
| `npm run dev` | Dev server (HMR) |
| `npm run build` | Production build (`dist/`) |
| `npm run preview` | Preview the build locally |
| `npm run lint` | ESLint |

## Structure

```
src/
├── pages/        # Login · Register · Dashboard · Analytics · Portfolio
│                 # Watchlist · Market · Exchange · Transactions · SearchStock · Game
├── components/   # TradeModal · ErrorBoundary · MarketFilter · SortSelect
├── context/      # UserContext — JWT-based global user state
├── query/        # TanStack Query hooks (account · holdings · watchlist · analytics)
├── i18n/         # ko.json · en.json (fully key-synced)
├── utils/        # formatters · stockNames
├── api.js        # fetch wrapper (injects the Bearer token, auto-logout on 401)
├── auth.js       # token storage / retrieval / decoding
└── config.js     # API base URL (VITE_API_URL)
```

## Deployment

Hosted as a static site on Vercel. `vercel.json` configures the SPA rewrite (all routes → `index.html`) and security headers (`X-Content-Type-Options`, `X-Frame-Options`). The backend address is injected via the `VITE_API_URL` environment variable.
