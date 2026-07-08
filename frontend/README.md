# Stock Game — Frontend

[Stock Game](../README.md)의 React 19 + Vite 클라이언트입니다. 모의 투자 시뮬레이터의 UI 전반(인증, 거래, 포트폴리오, Analytics, 게임 세션)을 담당합니다.

## 기술 스택

- **React 19** + **Vite 8** (HMR, `@vitejs/plugin-react`)
- **React Router 7** — 인증 가드(`RequireAuth`) 기반 라우팅
- **TanStack Query (React Query)** — 서버 상태 캐싱 / 무효화
- **Recharts** — 수익률·자산 배분·시세 차트
- **react-i18next** — 한국어 / 영어 다국어 (`src/i18n/`, 기본값 `ko`)
- **jwt-decode** — localStorage JWT에서 사용자 식별

## 개발

```bash
npm install
echo "VITE_API_URL=http://127.0.0.1:8000" > .env.local   # 미설정 시 127.0.0.1:8000 기본값
npm run dev      # http://localhost:5173
```

| 스크립트 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 로컬 미리보기 |
| `npm run lint` | ESLint |

## 구조

```
src/
├── pages/        # Login · Register · Dashboard · Analytics · Portfolio
│                 # Watchlist · Market · Exchange · Transactions · SearchStock · Game
├── components/   # TradeModal · ErrorBoundary · MarketFilter · SortSelect
├── context/      # UserContext — JWT 기반 전역 사용자 상태
├── query/        # TanStack Query 훅 (account · holdings · watchlist · analytics)
├── i18n/         # ko.json · en.json (key 완전 동기화)
├── utils/        # formatters · stockNames
├── api.js        # fetch 래퍼 (Bearer 토큰 주입, 401 자동 로그아웃)
├── auth.js       # 토큰 저장/조회/디코딩
└── config.js     # API 베이스 URL (VITE_API_URL)
```

## 배포

Vercel에 정적 호스팅됩니다. `vercel.json`이 SPA rewrite(모든 경로 → `index.html`)와 보안 헤더(`X-Content-Type-Options`, `X-Frame-Options`)를 설정합니다. 백엔드 주소는 `VITE_API_URL` 환경 변수로 주입합니다.
