# Stock Game 모의투자

React와 FastAPI로 만든 풀스택 가상 주식 투자 시뮬레이션입니다. 실제 주가 데이터로 가상 자금을 운용하고, 벤치마크 대비 수익률을 추적하며, 기간 제한 투자 챌린지에 도전할 수 있습니다.

## Live Demo

**App:** https://stock-game-gray.vercel.app

**API:** https://stock-game-api-6411.onrender.com/docs

## 주요 기능

- **실시간 시세** — Yahoo Finance를 통한 미국/한국 주식 실시간 가격 조회
- **이중 통화 포트폴리오** — USD와 KRW 동시 운용, 환전 기능 내장
- **게임 세션** — 초기 자금과 기간을 설정하고 S&P 500이나 KOSPI를 이겨보세요
- **투자 분석 대시보드** — 포트폴리오 추이, 종목별 수익률, 섹터 분석, 승률 등
- **멀티 유저** — 여러 프로필 생성 가능, 각각 독립적인 포트폴리오와 게임 기록 관리
- **한/영 전환** — 원클릭으로 한국어/영어 UI 전환
- **다크 모드** — 시스템 설정에 따라 자동 적용
- **시가총액 Top 30** — 미국/한국 시가총액 상위 30개 종목 한눈에 보기

## 기술 스택

**백엔드:** Python, FastAPI, SQLAlchemy, SQLite, yfinance
**프론트엔드:** React 19, Vite, Recharts, react-i18next, React Router

## 시작하기

### 사전 준비

- Python 3.10+
- Node.js 18+

### 백엔드 설정

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API가 `http://127.0.0.1:8000`에서 실행됩니다. `/docs`에서 자동 생성된 API 문서를 확인할 수 있습니다.

### 프론트엔드 설정

```bash
cd frontend
npm install
npm run dev
```

앱이 `http://localhost:5173`에서 열립니다.

## 프로젝트 구조

```
stock-game/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 앱, 백그라운드 작업
│   │   ├── database.py          # SQLAlchemy 엔진 & 세션
│   │   ├── models.py            # User, Holding, Transaction 등
│   │   ├── schemas.py           # Pydantic 요청 모델
│   │   ├── routes/
│   │   │   ├── users.py         # 프로필 CRUD
│   │   │   ├── stocks.py        # 종목 정보, 검색, 차트
│   │   │   ├── trading.py       # 매수, 매도, 환전
│   │   │   ├── portfolio.py     # 계좌, 보유종목, 스냅샷
│   │   │   ├── watchlist.py     # 관심종목 관리
│   │   │   ├── admin.py         # 자금 추가/제거 (갓모드)
│   │   │   ├── analytics.py     # 수익률, 섹터 분석
│   │   │   └── game.py          # 게임 세션, 벤치마크
│   │   └── services/
│   │       ├── stock_service.py  # 주가 & 종목정보 (캐싱)
│   │       ├── trading_service.py
│   │       ├── exchange_service.py
│   │       ├── market_service.py
│   │       ├── snapshot_service.py
│   │       └── benchmark_service.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # 라우터 & 네비게이션
│   │   ├── api.js               # 공통 fetch 헬퍼 (에러 처리)
│   │   ├── config.js            # API 베이스 URL 설정
│   │   ├── pages/               # Dashboard, Analytics, Game 등
│   │   ├── components/          # TradeModal
│   │   ├── context/             # UserContext (멀티유저 상태)
│   │   ├── i18n/                # 한국어 & 영어 번역
│   │   └── utils/               # 종목명 매핑
│   └── package.json
└── .gitignore
```

## 환경 변수

**프론트엔드** (`frontend/.env.local`):
```
VITE_API_URL=http://127.0.0.1:8000
```

**백엔드**: 로컬 개발 시 환경 변수 설정 불필요. SQLite 데이터베이스는 자동 생성됩니다.

## 라이선스

이 프로젝트는 개인/교육 목적으로 만들어졌습니다.

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
