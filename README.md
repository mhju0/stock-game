# Stock Game 모의투자

A full-stack virtual stock market simulation built with **React** and **FastAPI**. Trade real stocks with virtual money, track your performance against benchmarks, and compete in timed investment challenges.

## Features

- **Real-time market data** — live prices from Yahoo Finance for US and Korean stocks
- **Multi-currency portfolios** — trade in both USD and KRW with built-in currency exchange
- **Game sessions** — set a starting balance and time limit, then try to beat the S&P 500 or KOSPI
- **Analytics dashboard** — portfolio value over time, per-stock performance, sector breakdown, win rate
- **Multi-user support** — create multiple profiles, each with independent portfolios and game history
- **Bilingual UI** — full Korean (한국어) and English interface with one-click toggle
- **Dark mode** — automatic system-preference detection
- **Top 30 market view** — browse the largest US and Korean stocks by market cap

## Tech Stack

**Backend:** Python, FastAPI, SQLAlchemy, SQLite, yfinance
**Frontend:** React 19, Vite, Recharts, react-i18next, React Router

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API starts at `http://127.0.0.1:8000`. You can view the auto-generated docs at `/docs`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app opens at `http://localhost:5173`.

## Project Structure

```
stock-game/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, background tasks
│   │   ├── database.py          # SQLAlchemy engine & session
│   │   ├── models.py            # User, Holding, Transaction, etc.
│   │   ├── schemas.py           # Pydantic request models
│   │   ├── routes/
│   │   │   ├── users.py         # Profile CRUD
│   │   │   ├── stocks.py        # Stock info, search, history
│   │   │   ├── trading.py       # Buy, sell, currency exchange
│   │   │   ├── portfolio.py     # Account, holdings, snapshots
│   │   │   ├── watchlist.py     # Watchlist management
│   │   │   ├── admin.py         # Add/remove funds (god mode)
│   │   │   ├── analytics.py     # Performance, sector breakdown
│   │   │   └── game.py          # Game sessions, benchmarks
│   │   └── services/
│   │       ├── stock_service.py  # Price & info with caching
│   │       ├── trading_service.py
│   │       ├── exchange_service.py
│   │       ├── market_service.py
│   │       ├── snapshot_service.py
│   │       └── benchmark_service.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Router & navigation
│   │   ├── api.js               # Shared fetch helpers with error handling
│   │   ├── config.js            # API base URL config
│   │   ├── pages/               # Dashboard, Analytics, Game, etc.
│   │   ├── components/          # TradeModal
│   │   ├── context/             # UserContext (multi-user state)
│   │   ├── i18n/                # Korean & English translations
│   │   └── utils/               # Stock name mappings
│   └── package.json
└── .gitignore
```

## Environment Variables

**Frontend** (`frontend/.env.local`):
```
VITE_API_URL=http://127.0.0.1:8000
```

**Backend**: No env vars required for local development. The SQLite database is created automatically.

## License

This project is for personal/educational use.
