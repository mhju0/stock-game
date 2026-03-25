# 📈 Stock Game 모의투자
 
> **KO** — 가상 자금으로 실제 주식을 거래하고, 벤치마크를 이겨보세요.  
> **EN** — Trade real stocks with virtual money and beat the benchmark.
 
🌐 **[Live App](https://stock-game-gray.vercel.app)** · 📄 **[API Docs](https://stock-game-api-6411.onrender.com/docs)**
 
---
 
## ✨ 주요 기능 · Features
 
| | KO | EN |
|---|---|---|
| 📡 | 실시간 미국/한국 주가 | Live US & Korean stock prices |
| 💱 | USD·KRW 이중 통화 + 환전 | Dual-currency portfolio + FX |
| 🏆 | S&P 500 / KOSPI 벤치마크 챌린지 | Beat the S&P 500 or KOSPI |
| 📊 | 수익률·섹터 분석 대시보드 | Analytics: returns, sector breakdown |
| 👥 | 멀티 프로필 (독립 포트폴리오) | Multi-user with separate portfolios |
| 🌙 | 다크 모드 자동 적용 | Auto dark mode |
| 🇰🇷🇺🇸 | 한/영 원클릭 전환 | One-click Korean ↔ English UI |
 
---
 
## 🛠 기술 스택 · Tech Stack
 
**Backend** — Python · FastAPI · SQLAlchemy · SQLite · yfinance  
**Frontend** — React 19 · Vite · Recharts · react-i18next · React Router
 
---
 
## 🚀 시작하기 · Getting Started
 
**Prerequisites:** Python 3.10+ · Node.js 18+
 
### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://127.0.0.1:8000  |  /docs for API reference
```
 
### Frontend
```bash
cd frontend
npm install && npm run dev
# → http://localhost:5173
```
 
### 환경 변수 · Environment Variables
```bash
# frontend/.env.local
VITE_API_URL=http://127.0.0.1:8000
```
백엔드는 별도 설정 없이 SQLite DB가 자동 생성됩니다.  
No backend env vars required — SQLite is created automatically.
 
---
 
## 📁 프로젝트 구조 · Project Structure
 
```
stock-game/
├── backend/app/
│   ├── main.py              # FastAPI 앱 진입점 · App entry point
│   ├── models.py            # User, Holding, Transaction …
│   ├── routes/
│   │   ├── trading.py       # 매수·매도·환전 · Buy / Sell / FX
│   │   ├── portfolio.py     # 계좌·보유종목 · Account & holdings
│   │   ├── analytics.py     # 수익률·섹터 · Performance & sectors
│   │   └── game.py          # 게임 세션·벤치마크 · Sessions & benchmarks
│   └── services/            # 주가·거래·스냅샷 캐싱 · Price, trading, snapshots
└── frontend/src/
    ├── pages/               # Dashboard, Analytics, Game …
    ├── context/             # UserContext (멀티유저 · multi-user state)
    └── i18n/                # 한국어 & English translations
```
 
---
 
*개인 및 교육 목적으로 제작되었습니다. · Built for personal and educational use.*
