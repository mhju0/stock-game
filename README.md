# Stock Game

가상 자금으로 미국·한국 주식을 거래하고, 벤치마크(S&P 500, KOSPI) 대비 포트폴리오 성과를 측정하는 모의 투자 시뮬레이터입니다. 단순 기능 구현을 넘어, 금융 서비스 수준의 데이터 정합성과 확장 가능한 아키텍처 설계에 중점을 두었습니다.

**[Live App](https://stock-game-gray.vercel.app)** · **[API Docs](https://stock-game-api-6411.onrender.com/docs)**

---

## 주요 기능

- **실시간 시세 조회** — yfinance 기반 US / KR 마켓 가격 제공
- **이중 통화 포트폴리오** — USD / KRW 잔고 관리 및 실시간 FX 환전
- **벤치마크 비교** — S&P 500, KOSPI 지수 대비 수익률 측정
- **Analytics 대시보드** — Recharts 기반 종목별·섹터별 시각화
- **멀티 포트폴리오** — 독립된 투자 전략을 병렬로 운영 가능

---

## 아키텍처

단순히 상태를 저장하는 것이 아니라, **데이터 흐름의 일관성을 유지하는 것**에 초점을 맞춘 설계입니다.

### Transaction 기반 상태 계산

포트폴리오 잔고와 보유 종목을 독립된 레코드로 저장하지 않습니다. 모든 상태는 append-only `Transaction` 로그(매수, 매도, FX 환전)로부터 동적으로 계산되며, 이를 통해 완전한 audit trail과 특정 시점의 상태 복원이 가능합니다. 주기적인 Snapshot과 인메모리 캐싱으로 조회 시 연산 비용을 최소화했습니다.

### Service Layer 분리

HTTP `routes`는 요청 검증과 응답 포맷팅만 담당합니다. 핵심 비즈니스 로직은 별도의 `services` 레이어에 격리하여, transport 계층과 무관하게 테스트 및 재사용이 가능한 구조를 구축했습니다.

### Data Modeling

Portfolio를 독립 엔티티로 분리하여 한 명의 유저가 복수의 전략을 병렬 운영할 수 있도록 했습니다. 통화 단위를 트랜잭션별로 명시 관리하여, 환율 변동이 성과 지표를 왜곡하는 것을 방지합니다.

---

## 기술 스택

| 레이어 | 구성 |
|---|---|
| Backend | Python · FastAPI · SQLAlchemy · SQLite · yfinance |
| Frontend | React 19 · Vite · Recharts · react-i18next · React Router |
| Deploy | Vercel (Frontend) · Render (API) |

---

## 시작하기

**사전 요구사항:** Python 3.10+ · Node.js 18+

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://127.0.0.1:8000  (API 문서: /docs)
```

### Frontend

```bash
cd frontend
npm install && npm run dev
# → http://localhost:5173
```

> Backend는 별도 환경 변수 없이 SQLite DB가 자동 생성됩니다.
> Frontend의 경우 `frontend/.env.local`에 `VITE_API_URL=http://127.0.0.1:8000`을 추가해 주세요.

---

## 프로젝트 구조

```
stock-game/
├── backend/app/
│   ├── main.py          # FastAPI 진입점
│   ├── models.py        # SQLAlchemy 모델 (User, Holding, Transaction)
│   ├── routes/          # Endpoint — trading, portfolio, analytics
│   └── services/        # 비즈니스 로직 및 외부 API 통신 레이어
└── frontend/src/
    ├── pages/           # Dashboard, Analytics, Game
    ├── context/         # 전역 상태 관리 (UserContext)
    └── i18n/            # 다국어 지원 (KR / EN)
```

---

## Roadmap

- **PostgreSQL 마이그레이션** — 동시성 제어 및 수평 확장
- **WebSocket 스트리밍** — polling 방식을 실시간 시세 피드로 전환
- **Redis 캐싱** — yfinance rate limit 대응 및 응답 지연 최소화
- **인증** — JWT 기반 authentication & authorization 도입
