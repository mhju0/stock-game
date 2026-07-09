# Stock Game

가상 자금으로 미국·한국 주식을 거래하고, 벤치마크(S&P 500, KOSPI) 대비 포트폴리오 성과를 측정하는 모의 투자 시뮬레이터입니다. 단순 기능 구현을 넘어, 금융 서비스 수준의 데이터 정합성과 확장 가능한 아키텍처 설계에 중점을 두었습니다.

**[Live App](https://stock-game-gray.vercel.app)** · **[API Docs](https://stock-game-6411.onrender.com/docs)**

---

## 주요 기능

- **JWT 인증** — bcrypt 비밀번호 해싱 기반 회원가입 / 로그인, 7일 만료 토큰
- **실시간 시세 조회** — yfinance 기반 US / KR 마켓 가격 제공 (인메모리 캐싱 적용)
- **이중 통화 포트폴리오** — USD / KRW 잔고 관리 및 실시간 FX 환전
- **매매 & 손익 계산** — 평균 단가(average cost) 기반 보유 종목 관리, 실현/미실현 손익 추적
- **벤치마크 비교** — S&P 500, KOSPI 지수 대비 수익률 측정
- **Analytics 대시보드** — Recharts 기반 수익률·자산 배분 추이, 종목별 시각화
- **게임 세션** — 시작 자본·기간을 설정한 투자 챌린지, 종료 시 성과 요약 (best/worst trade, win rate 등)
- **Watchlist & Top 30** — 관심 종목 저장, 시가총액 상위 30개 종목 목록
- **한국어 / 영어 i18n** — react-i18next 기반 전체 UI 다국어 지원

---

## 아키텍처

상태를 단순히 저장하는 것을 넘어, **데이터 흐름의 일관성과 감사 가능성(auditability)** 에 초점을 맞춘 설계입니다.

### Service Layer 분리

HTTP `routes`는 요청 검증과 응답 포맷팅, 인증(`Depends(get_current_user)`)만 담당합니다. 핵심 비즈니스 로직(매매, 환전, 평가, 스냅샷)은 별도의 `services` 레이어에 격리하여, transport 계층과 무관하게 테스트 및 재사용이 가능한 구조를 구축했습니다.

### 상태 모델: 가변 잔고 + 감사 로그 + 시계열 스냅샷

- **현재 상태**(현금 잔고 `User.balance_*`, 보유 종목 `Holding`)는 직접 저장·갱신되어 조회 시 연산 비용이 없습니다.
- 모든 매수·매도·환전은 append-only `Transaction` 로그로 기록되어 완전한 **audit trail**과 실현 손익(realized P&L) 계산의 근거가 됩니다.
- 주기적인 `PortfolioSnapshot`(시간별 + 매 거래 시점)으로 자산 가치의 **시계열**을 남겨, 수익률 곡선과 벤치마크 비교를 지원합니다.

### Currency-aware Data Modeling

통화 단위를 트랜잭션·보유 종목별로 명시 관리하고, 모든 합산 지표는 환율을 적용해 KRW 기준으로 정규화합니다. 이를 통해 환율 변동이 성과 지표를 왜곡하는 것을 방지합니다.

### yfinance 의존성 완화

비공식 데이터 소스(yfinance)의 불안정성에 대응하기 위해 다층 방어를 적용했습니다 — 가격/정보/환율 **인메모리 캐시**(TTL 300/600/3600초), 섹터·산업 **정적 매핑**(`static_fundamentals.py`), 시가총액 상위 종목 **정적 목록**, 호출 throttling(`Semaphore`), 그리고 실패 시 **stale-cache fallback**.

---

## 기술 스택

| 레이어 | 구성 |
|---|---|
| Backend | Python 3.11 · FastAPI · SQLAlchemy · Supabase Postgres · SQLite local fallback · yfinance |
| Auth | JWT (`python-jose`) · `bcrypt` |
| Frontend | React 19 · Vite · React Router 7 · TanStack Query · Recharts · react-i18next |
| Deploy | Vercel (Frontend) · Render (API, gunicorn + Uvicorn workers) |

---

## 시작하기

**사전 요구사항:** Python 3.11 · Node.js 18+

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# JWT_SECRET_KEY는 필수입니다. 없으면 서버가 시작되지 않습니다.
cp .env.example .env
python3 -c "import secrets; print(secrets.token_hex(32))"   # 출력값을 .env의 JWT_SECRET_KEY에 입력

uvicorn app.main:app --reload
# → http://127.0.0.1:8000  (API 문서: /docs)
```

> SQLite DB(`backend/stock_game.db`)는 최초 실행 시 자동 생성됩니다.
> Production은 Supabase Postgres를 사용하며, SQLite는 로컬 개발 fallback입니다.

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://127.0.0.1:8000" > .env.local   # 미설정 시 127.0.0.1:8000 기본값
npm run dev
# → http://localhost:5173
```

---

## 환경 변수

| 위치 | 변수 | 필수 | 설명 |
|---|---|---|---|
| backend | `JWT_SECRET_KEY` | ✅ | 토큰 서명 키 (미설정 시 서버 부팅 실패) |
| backend | `FRONTEND_URL` | ⛔ | 프로덕션 프론트엔드 오리진 (CORS 허용 목록에 추가) |
| frontend | `VITE_API_URL` | ⛔ | 백엔드 API 주소 (기본값 `http://127.0.0.1:8000`) |

---

## 프로젝트 구조

```
stock-game/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 진입점 · 라우터 등록 · 백그라운드 루프
│   │   ├── auth.py          # JWT 발급/검증, bcrypt 해싱
│   │   ├── models.py        # SQLAlchemy 모델 (User, Holding, Transaction, Snapshot, GameSession)
│   │   ├── schemas.py       # Pydantic 요청 스키마
│   │   ├── routes/          # auth · users · stocks · trade · portfolio · watchlist · admin · analytics · game
│   │   └── services/        # trading · market · stock · exchange · snapshot · valuation · benchmark · static_fundamentals
│   ├── render.yaml          # Render 배포 설정
│   └── Procfile             # gunicorn + UvicornWorker 시작 명령
└── frontend/
    ├── src/
    │   ├── pages/           # Login · Register · Dashboard · Analytics · Portfolio · Watchlist · Market · Exchange · Transactions · SearchStock · Game
    │   ├── components/      # TradeModal · ErrorBoundary · MarketFilter · SortSelect
    │   ├── context/         # UserContext (JWT 기반 전역 상태)
    │   ├── query/           # TanStack Query 훅
    │   ├── i18n/            # 다국어 지원 (ko / en)
    │   └── utils/           # formatters · stockNames
    └── vercel.json          # SPA rewrite + 보안 헤더
```

---

## 알려진 제약 (Known Limitations)

- **로컬 SQLite fallback** — Production은 Supabase Postgres를 사용합니다. 로컬 SQLite DB(`backend/stock_game.db`)는 개발용이며 재생성될 수 있습니다.
- **yfinance 안정성** — 비공식 데이터 소스로, 일시적 장애 시 일부 시세가 비어 보일 수 있습니다 (캐시로 완화).
- **콜드 스타트** — Render 무료 티어 백엔드는 첫 요청 시 약 30–60초의 wake-up 지연이 있습니다.

---

## Roadmap

- **운영 DB hardening** — Supabase Postgres 운영 스키마와 백업/복구 절차 점검
- **테스트 커버리지** — service 레이어 대상 pytest 도입 (평균 단가 · 실현 손익 · 환전 · 스냅샷 로직)
- **WebSocket 스트리밍** — polling 방식을 실시간 시세 피드로 전환
- **Redis 캐싱** — yfinance rate limit 대응 및 인메모리 캐시의 워커 간 공유
