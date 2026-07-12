# Stock Game

가상 자금으로 미국·한국 주식을 거래하고, 벤치마크(S&P 500, KOSPI) 대비 포트폴리오 성과를 측정하는 모의 투자 시뮬레이터입니다. 단순 기능 구현을 넘어, 금융 서비스 수준의 데이터 정합성과 확장 가능한 아키텍처 설계에 중점을 두었습니다.

**[Live App](https://stock-game-gray.vercel.app)** · **[API Docs](https://stock-game-6411.onrender.com/docs)**

무료 호스팅 특성상 첫 접속 시 서버 wake-up에 30–60초가 걸릴 수 있습니다.

데모 계정: `demo` / `demo1234` — 회원가입 없이 바로 체험할 수 있습니다. 매 배포 시 미리 매매·환전이 완료된 포트폴리오로 초기화됩니다.

---

## 스크린샷

<!-- 스크린샷은 라이브 배포(demo/demo1234)에서 캡처해 docs/screenshots/ 에 추가 예정 -->
> 라이브 앱에서 바로 확인하실 수 있습니다 → **[stock-game-gray.vercel.app](https://stock-game-gray.vercel.app)** (`demo` / `demo1234`)

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

### 상태 모델: 세션 스코프 잔고 + 감사 로그 + 시계열 스냅샷

- **`GameSession`이 플레이 가능한 포트폴리오 상태를 소유**합니다 — `cash_krw`/`cash_usd`, `title`, `status`(active/completed/expired/archived) 등을 가진 게임 세션 단위로 자금이 관리되며, 한 사용자가 여러 게임을 동시에 독립적으로 진행할 수 있습니다.
- `Holding`, `Transaction`, `PortfolioSnapshot`은 모두 `game_session_id`로 스코프되어 게임 간 데이터가 섞이지 않습니다. **Watchlist만 예외적으로 사용자 단위**(session-agnostic)로 유지되어, 게임을 넘나들며 관심 종목을 재사용할 수 있습니다.
- 모든 매수·매도·환전은 append-only `Transaction` 로그로 기록되어 완전한 **audit trail**과 실현 손익(realized P&L) 계산의 근거가 됩니다.
- 주기적인 `PortfolioSnapshot`(시간별 + 매 거래 시점)으로 세션별 자산 가치의 **시계열**을 남겨, 수익률 곡선과 벤치마크 비교, 종료된 게임의 결과 재구성을 지원합니다.
- 게임 생성은 **비파괴적**이며, 종료·만료·완료·보관된 게임은 결과 리뷰 페이지로 전환됩니다. 매매/환전은 종료 상태에서 서버 사이드로 차단됩니다. 세션 삭제는 해당 세션에 스코프된 holdings/transactions/snapshots만 제거하며, watchlist와 다른 게임에는 영향을 주지 않습니다.

### Custom JWT vs Supabase Auth

DB는 Supabase Postgres를 쓰지만, 인증은 Supabase Auth 대신 자체 **JWT**(`python-jose` + `bcrypt`)로 구현했습니다. Supabase RLS(Row Level Security)는 활성화되어 있지만 앱은 서비스 role 하나로 접속하므로, RLS는 최후의 방어선일 뿐 1차 격리 수단은 아닙니다 — 실제 사용자 단위 격리는 FastAPI 레이어의 ownership helper(모든 세션 스코프 라우트가 공유하는 `get_owned_session` 등)가 담당하며, cross-user 접근은 404로 응답해 리소스 존재 여부까지 숨깁니다. 이 트레이드오프를 선택한 이유는, 커스텀 JWT 쪽이 게임(세션) 단위의 세밀한 인가 로직 — 종료된 게임 매매 차단, 다중 활성 게임 지원 등 — 을 애플리케이션 코드로 명시적으로 제어하기에 더 적합했기 때문입니다.

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
| backend | `DATABASE_URL` | ⛔ | Supabase Postgres 연결 문자열 (미설정 시 로컬 SQLite로 자동 폴백) |
| backend | `ENABLE_DEV_TOOLS` | ⛔ | 개발용 잔액 조정 엔드포인트 활성화 (프로덕션에서는 `false`/미설정 유지) |
| frontend | `VITE_API_URL` | ⛔ | 백엔드 API 주소 (기본값 `http://127.0.0.1:8000`) |
| frontend | `VITE_ENABLE_DEV_TOOLS` | ⛔ | 프론트엔드 개발자 도구 UI 노출 (프로덕션에서는 `false`/미설정 유지) |

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
│   │   └── services/        # trading · market · stock · exchange · snapshot · valuation · benchmark · game_session · seed · static_fundamentals
│   ├── tests/               # pytest suite (122개 테스트)
│   ├── render.yaml          # Render 배포 설정
│   └── Procfile             # gunicorn + UvicornWorker 시작 명령
├── frontend/
│   ├── src/
│   │   ├── pages/           # Login · Register · Dashboard · Analytics · Portfolio · Watchlist · Market · Exchange · Transactions · SearchStock · Game
│   │   ├── components/      # TradeModal · ErrorBoundary · MarketFilter · SortSelect
│   │   ├── context/         # UserContext (JWT 기반 전역 상태)
│   │   ├── query/           # TanStack Query 훅
│   │   ├── i18n/            # 다국어 지원 (ko / en)
│   │   └── utils/           # formatters · stockNames
│   └── vercel.json          # SPA rewrite + 보안 헤더
└── scripts/
    └── regression-smoke.sh  # 회귀 스모크 (REGRESSION_SMOKE.md 참고)
```

---

## 테스트 / QA

- **Backend pytest** — `backend/tests/`에서 122개 테스트가 통과합니다. 매매·환전(`test_trading.py`), 게임 세션 라이프사이클(`test_game.py`, `test_game_session_service.py`), 포트폴리오/분석(`test_portfolio.py`, `test_analytics.py`), 스냅샷(`test_snapshot_service.py`, `test_snapshot_batch.py`), 인증(`test_auth.py`), 가격/환율 이상값 가드(`test_price_guards.py`), legacy 거래 경로 격리(`test_legacy_trade_isolation.py`) 등을 실제 잔액·DB row·응답 body 값으로 검증합니다.
- **회귀 스모크** — `./scripts/regression-smoke.sh`(`REGRESSION_SMOKE.md` 참고)가 in-memory DB와 mocked market data로 로그인 → 게임 생성 → 매매/환전 → cross-user 404 → 세션 격리 → delete 경계까지 한 번에 확인하는 pre-commit 게이트입니다. Production credential이나 Supabase 접근이 필요 없습니다.
- **Frontend navigation 체크** — `npm run smoke:navigation`(`frontend/scripts/check-session-navigation.mjs`)이 Watchlist/Market에서 종목 상세로의 라우팅 패턴이 소스 레벨에서 유지되는지 확인합니다. 브라우저 E2E는 아니며, 리팩터링 중 회귀를 잡아내는 tripwire 역할입니다.

---

## 알려진 제약 (Known Limitations)

- **로컬 SQLite fallback** — Production은 Supabase Postgres를 사용합니다. 로컬 SQLite DB(`backend/stock_game.db`)는 개발용이며 재생성될 수 있습니다.
- **yfinance 안정성** — 비공식 데이터 소스로, 일시적 장애 시 일부 시세가 비어 보일 수 있습니다 (캐시로 완화).
- **콜드 스타트** — Render 무료 티어 백엔드는 첫 요청 시 약 30–60초의 wake-up 지연이 있습니다.
- **무료 티어 메모리** — pandas/yfinance 베이스라인이 512MB 인스턴스에 비해 크므로, `MALLOC_ARENA_MAX`로 glibc malloc arena를 제한해 OOM 재시작을 완화했습니다.
- **인증 rate limiting 부재** — `/auth/login`·`/register`에 rate limiting이 없어 원론적으로 무차별 대입에 노출됩니다. 실제 자금·개인정보가 없는 데모 특성상 감수한 트레이드오프이며, 운영 전환 시 `slowapi` 등으로 추가할 지점입니다.
- **약한 비밀번호 정책** — 최소 4자만 요구합니다(가상 자금 데모 기준). 실서비스라면 복잡도·길이 요건을 강화해야 합니다.

---

## Roadmap

- **운영 DB hardening** — Supabase Postgres 운영 스키마와 백업/복구 절차 점검
- **WebSocket 스트리밍** — polling 방식을 실시간 시세 피드로 전환
- **Redis 캐싱** — yfinance rate limit 대응 및 재배포/재시작 시에도 유지되는 캐시
