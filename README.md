# 📈 Stock Game — 실시간 모의 투자 시스템
### 가상 자금으로 실제 주식을 거래하고, 벤치마크(S&P 500, KOSPI) 대비 성과를 측정할 수 있는 투자 시뮬레이션 시스템입니다. 단순한 기능 구현을 넘어, **실제 금융 서비스와 유사한 데이터 정합성 및 확장 가능한 아키텍처**를 설계하는 데 중점을 두었습니다.
##### 🌐 **[Live App](https://stock-game-gray.vercel.app)** · 📄 **[API Docs](https://stock-game-api-6411.onrender.com/docs)**
---
## ✨ 주요 기능 (Key Features)
 
| 카테고리 | 기능 설명 |
|---|---|
| 📡 **실시간 데이터** | 미국(US) 및 한국(KR) 주식 실시간 가격 조회 |
| 💱 **다중 통화 관리** | USD / KRW 이중 통화 포트폴리오 및 실시간 환전(FX) |
| 🏆 **벤치마크 비교** | S&P 500 / KOSPI 지수 대비 내 포트폴리오 수익률 챌린지 |
| 📊 **대시보드 분석** | Recharts를 활용한 종목 및 섹터 기반 시각화 (Analytics) |
| 👥 **멀티 프로필** | 독립된 투자 전략을 실험할 수 있는 다중 포트폴리오 세션 |
---

## 🏗 아키텍처 및 핵심 설계 (Engineering Decisions)

이 프로젝트는 상태(State)를 단순히 저장하는 것을 넘어, **"데이터 흐름의 일관성을 어떻게 유지할 것인가"**에 초점을 맞췄습니다.

### 1. 거래 기록 기반의 상태 계산 (Transaction-based State)
* **Source of Truth:** 포트폴리오의 현재 잔고나 보유 주식(Holding)을 DB에 독립된 상태로 저장하지 않고, 모든 상태가 `Transaction`(매수/매도/환전) 기록으로부터 동적으로 계산되도록 설계했습니다.
* **설계 이유:** 금융 시스템에서 가장 중요한 **데이터 정합성(Data Integrity)**을 보장하고, 과거 특정 시점의 포트폴리오 상태를 완벽하게 복원하기 위함입니다.
* **Trade-off 완화:** 매 조회마다 발생하는 계산 비용(Compute Cost)의 증가를 해결하기 위해, 주기적인 스냅샷(Snapshot)과 인메모리 캐싱(Caching) 전략을 도입하여 성능을 최적화했습니다.

### 2. 비즈니스 로직과 API 레이어 분리 (Service Layer Separation)
* HTTP 요청을 처리하는 `routes`와 핵심 비즈니스 로직을 담당하는 `services` 레이어를 명확히 분리했습니다.
* 이를 통해 코드의 가독성을 높이고, 향후 테스트 코드(Unit Test) 작성 및 로직 재사용이 용이한 구조를 구축했습니다.

### 3. 유연한 데이터 모델링 (Data Modeling)
* `Portfolio` 단위를 분리하여 한 명의 유저가 여러 전략(A/B Test)을 운영할 수 있도록 확장성을 고려했습니다.
* 통화 단위(USD/KRW)를 명시적으로 분리하여, 환율 변동이 포트폴리오 성과 측정에 미치는 왜곡을 방지했습니다.

---
## 🛠 기술 스택 (Tech Stack)
 
* **Backend:** Python, FastAPI, SQLAlchemy, SQLite, yfinance
* **Frontend:** React 19, Vite, Recharts, react-i18next, React Router
* **Deployment:** Vercel (Frontend), Render (Backend API)
 
---
## 🚀 시작하기 (Getting Started)
 
**요구 사항 (Prerequisites):** Python 3.10+ · Node.js 18+
 
### Backend Setup
```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# → [http://127.0.0.1:8000](http://127.0.0.1:8000) 접속 (API 문서는 /docs 확인)
```
### Frontend Setup
```bash
cd frontend
npm install && npm run dev
# → http://localhost:5173 접속
```
 
> **Note:** 백엔드는 별도의 환경 변수 설정 없이 SQLite DB가 자동 생성됩니다. 프론트엔드의 경우 `frontend/.env.local` 파일에 `VITE_API_URL=http://127.0.0.1:8000`를 추가해 주세요.

---
## 📁 프로젝트 구조 (Project Structure)
 
```text
stock-game/
├── backend/app/
│   ├── main.py              # FastAPI 앱 진입점
│   ├── models.py            # 데이터 모델 (User, Holding, Transaction)
│   ├── routes/              # HTTP 엔드포인트 (trading, portfolio, analytics)
│   └── services/            # 비즈니스 로직 및 외부 API(yfinance) 통신 레이어
└── frontend/src/
    ├── pages/               # 주요 UI (Dashboard, Analytics, Game)
    ├── context/             # 전역 상태 관리 (UserContext)
    └── i18n/                # 다국어 지원 (한국어/영어)
```
 
---
## 🌱 개선 및 확장 계획 (Future Improvements)

초기 구현된 아키텍처를 바탕으로, 실제 프로덕션 레벨에 가까운 시스템으로 고도화할 계획입니다.
* **Database Migration:** 동시성 제어 및 확장성을 위해 SQLite에서 PostgreSQL로 마이그레이션.
* **Real-time Streaming:** 빈번한 Polling 대신 WebSocket 기반의 실시간 주가 스트리밍 도입.
* **Caching Layer:** 외부 API(yfinance) Rate limit 대응 및 성능 개선을 위한 Redis 캐시 도입.
* **Security:** JWT 기반의 사용자 인증 및 인가 시스템 추가.
