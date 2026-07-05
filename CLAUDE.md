# stock-game

가상 자금으로 미국·한국 주식을 거래하고 벤치마크(**S&P 500, KOSPI**) 대비 포트폴리오 성과를 측정하는 **모의 투자 시뮬레이터**. 단순 기능 구현을 넘어 금융 서비스 수준의 데이터 정합성과 확장 가능한 아키텍처를 지향하는 포트폴리오 프로젝트. (출처: `README.md`)

- Frontend (live): https://stock-game-gray.vercel.app
- API docs (live): https://stock-game-api-6411.onrender.com/docs

## 스택

**Backend** (`backend/`, `requirements.txt` 기준)
- Python **3.11.9** (`backend/.python-version`) · FastAPI · SQLAlchemy ORM
- Auth: JWT (`python-jose[cryptography]`) + `bcrypt`
- 시세: `yfinance` · outbound HTTP: `requests`
- DB: **SQLite** (`backend/stock_game.db`, gitignored, 첫 실행 시 `models.Base.metadata.create_all()`로 자동 생성). requirements에 `psycopg2-binary`가 포함돼 있으나 로컬/문서 기본 DB는 SQLite다. [Inferred]
- 배포: Render — Gunicorn + UvicornWorker (`backend/Procfile`, `backend/render.yaml`)

**Frontend** (`frontend/`, `package.json` 기준)
- React **19** · Vite **8** · React Router **7** (`react-router-dom`) · TanStack Query **5** · Recharts **3**
- i18n: `react-i18next` + `i18next` (한국어/영어) · `jwt-decode`
- Lint: ESLint **9** flat config (`frontend/eslint.config.js`)
- 배포: Vercel — SPA rewrite + security headers (`frontend/vercel.json`)

**패키지 매니저**: backend = pip (`requirements.txt`) · frontend = **npm** (`package-lock.json`).

## 실행

Backend:

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python3 -c "import secrets; print(secrets.token_hex(32))"   # 출력값을 .env의 JWT_SECRET_KEY에 붙여넣기
uvicorn app.main:app --reload                      # http://127.0.0.1:8000 (docs: /docs)
```

> `JWT_SECRET_KEY`가 없으면 서버가 뜨지 않는다. SQLite DB는 첫 실행 시 자동 생성.

Frontend:

```bash
cd frontend
npm install
echo "VITE_API_URL=http://127.0.0.1:8000" > .env.local   # 미설정 시 127.0.0.1:8000 기본값
npm run dev                                         # http://localhost:5173
```

frontend npm scripts: `dev`(vite) · `build`(vite build) · `lint`(eslint .) · `preview`(vite preview).

## 디렉터리 지도

```text
backend/
  app/
    main.py         FastAPI 진입점: 라우터 등록, CORS, 백그라운드 snapshot 루프, 시세 refresh 스케줄러
    auth.py         JWT + bcrypt 유틸
    models.py       SQLAlchemy ORM (User, Holding, Transaction, PortfolioSnapshot, GameSession)
    schemas.py      Pydantic 요청 스키마
    database.py     engine / SessionLocal / Base
    routes/         9개 엔드포인트 모듈: auth, users, stocks, trading, portfolio, watchlist, admin, analytics, game
    services/       9개 business logic 모듈: trading, market, stock, exchange, snapshot, valuation, benchmark, static_fundamentals, seed
  tests/            pytest (test_auth.py, test_trading.py)
  data/             정적 데이터
  requirements.txt  Python deps
  .env.example      JWT_SECRET_KEY, FRONTEND_URL
  .python-version   3.11.9
  Procfile / render.yaml   Render 배포 설정
  pytest.ini        testpaths = tests/
  stock_game.db     SQLite (gitignored)
frontend/
  src/
    pages/          페이지 컴포넌트 (Login, Register, Dashboard, Analytics, Portfolio, Watchlist, Market, Exchange, Transactions, SearchStock, Game 등)
    components/     재사용 UI (TradeModal, ErrorBoundary 등)
    context/        UserContext (JWT 기반 전역 상태)
    query/          TanStack Query 훅
    i18n/           react-i18next 설정 (한/영)
    utils/          포매터, stockNames 등
    api.js          API 클라이언트 + Query 훅
    auth.js         JWT 인코드/디코드 + 저장
    App.jsx         라우터 + 레이아웃
    main.jsx        React 루트 진입점
    config.js       API URL 설정
  package.json / vite.config.js / eslint.config.js / vercel.json / .env.example
README.md           전체 문서 (한/영)
PROJECT_STATE.md    프로젝트 상태 노트
```

## 환경변수

| 위치 | 변수 | 필수 | 용도 |
|---|---|---|---|
| `backend/.env` | `JWT_SECRET_KEY` | ✅ | 토큰 서명 (없으면 서버 미기동). Render에서는 자동 생성. |
| `backend/.env` | `FRONTEND_URL` | ⛔ | 프로덕션 프론트 CORS origin |
| `frontend/.env.local` | `VITE_API_URL` | ⛔ | 백엔드 API URL (기본 `http://127.0.0.1:8000`) |

## 프로젝트 컨벤션 (실재하는 것만)

- **Service Layer 패턴**: HTTP 라우트(`routes/`)는 검증/auth만 담당하고 business logic은 `services/`에 분리한다(테스트 용이성). (README 아키텍처 노트)
- **상태 모델**: mutable current state(User balance, Holding) + append-only Transaction 로그 + 주기적 PortfolioSnapshot(감사 추적). (README)
- **멀티 통화**: USD/KRW를 FX-aware하게 정규화한다. (README)
- **yfinance 복원력**: in-memory TTL 캐시(300/600/3600s) + 정적 fallback + throttling + stale-cache fallback. (README)
- **Lint 규칙**: `no-unused-vars`는 error, 단 대문자/`_` 접두 변수는 예외 (`frontend/eslint.config.js`).
- **테스트**: pytest, testpaths=`tests/` (`backend/pytest.ini`). 현재 `test_auth.py`, `test_trading.py` 존재.
- **DB 마이그레이션**: Alembic 등 마이그레이션 시스템 없음 — 스키마는 `create_all()`로 생성되고 변경은 수동. [Inferred]
- **기존 에이전트 지침 파일 없음**: 이 파일 이전에는 `.cursorrules`/`AGENTS.md`/`CLAUDE.md`가 없었다. `.claude/settings.local.json`만 존재.

## 확인 필요 / 미확정

- 테스트 커버리지 범위 불명확 — README 로드맵에 "pytest coverage TODO" 언급. [Unknown]
- Render 무료 티어에서 SQLite는 영속 디스크가 없으면 휘발 — 현재 영속 설정 여부 미확인. [Unknown]
- `PROJECT_STATE.md`는 존재하나 이 문서 작성 시 미검토. 상세 상태는 그 파일 참고. [Unknown]

## Claude conventions

<!-- `_reference_instructions.md`에서 그대로 복사한 공통 규칙 (Models · Effort · Prompt 형식 · Git commit 형식). 프로젝트 간 byte-identical로 유지 — 여기서 직접 고치지 말고 `_reference_instructions.md`에서 관리한다. -->

## Claude Code Prompts
Claude Code 프롬프트를 요청하면 항상:
- 추천 model + effort
- command 코드블록 1개, 그리고 별도의 prompt body 코드블록 1개
- 프롬프트는 간결하게 (불필요하게 길게 쓰지 마)

Format: claude --model <model> --effort <effort>

(prompt body는 별도 코드블록)

Models
- haiku / claude-haiku-4-5 — 소소한 수정, 오타, 포맷팅, 저위험 단일 파일
- sonnet / claude-sonnet-5 — 기본값. 일반 버그 수정, 기능, 소규모 refactor, 테스트
- opus / claude-opus-4-8 — 복잡/cross-file, 어려운 디버깅, DB/auth/security/scheduling/notification 로직
- fable / claude-fable-5 — 가장 어려운 작업: 깊은 audit, 대규모 refactor, 긴 multi-step 조사

Effort
- low — 단순, 저위험
- medium — 일반 기본값
- high — 대부분의 실제 버그 수정·기능 작업
- xhigh — 깊은 추론, multi-file 조사, 신중한 audit
- max — 매우 어렵거나 high-stakes
- ultracode — 대규모 multi-step agentic 작업용 Claude Code 전용 모드

기본: 애매하면 sonnet medium. data integrity/auth/DB/schema/security/scheduling/notification은 최소 sonnet high.

## Git Commits
내가 직접 실행할 git add/commit을 줄 때는 항상:
- git add와 git commit을 하나의 "bash" 코드블록에 함께 넣어라 (한 번 클릭으로 전체 복사 가능하게).
- 별도 편집 없이 그대로 paste해서 실행 가능해야 한다. placeholder 금지, 실제 파일 경로와 실제 commit message를 넣어라.
- commit message는 professional English로.
- 형식:

  git add path/to/fileA path/to/fileB
  git commit -m "Professional English commit message here"

Claude Code는 필요하면 스스로 git add / git commit을 실행해도 된다.
모든 git 작업을 나에게 넘길 필요는 없다. 다만 위 포맷 규칙은
"내가 직접 실행하도록 명령을 제시할 때" 적용된다.
