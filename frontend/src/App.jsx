import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useContext } from "react";
import { UserContext } from "./context/userContext";
import { isAuthenticated } from "./auth";
import { useSessionDetailQuery, useSessionListQuery } from "./query/queries";
import { gamePath, getSessionIdFromPath, sessionStatusLabelKey } from "./sessionRoutes";
import ErrorBoundary from "./components/ErrorBoundary";
import "./App.css";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SearchStock = lazy(() => import("./pages/SearchStock"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Exchange = lazy(() => import("./pages/Exchange"));
const Watchlist = lazy(() => import("./pages/Watchlist"));
const Market = lazy(() => import("./pages/Market"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Game = lazy(() => import("./pages/Game"));
const Games = lazy(() => import("./pages/Games"));

function RouteLoading() {
  const { t } = useTranslation();
  return <p>{t("common.loading")}</p>;
}

function RequireAuth({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function ResolveGameRedirect({ section = "status" }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { currentUserId } = useContext(UserContext);
  const sessionsQuery = useSessionListQuery(currentUserId);

  if (sessionsQuery.isLoading) return <p>{t("common.loading")}</p>;

  const session = Array.isArray(sessionsQuery.data?.sessions)
    ? sessionsQuery.data.sessions[0]
    : null;
  const path = session?.id ? gamePath(session.id, section) : "/games";
  const target = session?.id ? `${path}${location.search}` : path;
  return <Navigate to={target} replace />;
}

function SessionGuard() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const { currentUserId } = useContext(UserContext);
  const sessionQuery = useSessionDetailQuery(currentUserId, sessionId);
  const session = sessionQuery.data?.session || null;

  if (sessionQuery.isLoading) return <p>{t("common.loading")}</p>;

  if (!session) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>{t("games.notFoundTitle")}</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
          {sessionQuery.error?.message || t("games.notFoundBody")}
        </p>
        <NavLink to="/games" className="btn btn-primary">
          {t("nav.myGames")}
        </NavLink>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 2 }}>
              {t("games.currentGame")}
            </div>
            <div style={{ fontWeight: 700 }}>
              {session.title || t("games.cardTitle")}
            </div>
          </div>
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "5px 10px",
              color: session.status === "active" ? "var(--positive)" : "var(--text-secondary)",
              background: session.status === "active" ? "var(--positive-bg)" : "var(--bg-secondary)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t(sessionStatusLabelKey(session))}
          </span>
        </div>
      </div>
      <Outlet context={{ session, sessionId }} />
    </>
  );
}

function AppLayout() {
  const { t, i18n } = useTranslation();
  const { logout } = useContext(UserContext);
  const location = useLocation();
  const sessionId = getSessionIdFromPath(location.pathname);
  const selectedGameBase = sessionId ? `/games/${sessionId}` : null;

  const primaryNav = selectedGameBase
    ? [
        { to: "/games", label: t("nav.myGames"), end: true },
        { to: selectedGameBase, label: t("nav.game"), end: true },
        { to: `${selectedGameBase}/portfolio`, label: t("nav.portfolio") },
        { to: `${selectedGameBase}/search`, label: t("nav.search") },
        { to: `${selectedGameBase}/exchange`, label: t("nav.exchange") },
      ]
    : [
        { to: "/games", label: t("nav.myGames"), end: true },
        { to: "/", label: t("nav.game"), end: true },
        { to: "/portfolio", label: t("nav.portfolio") },
        { to: "/search", label: t("nav.search") },
        { to: "/exchange", label: t("nav.exchange") },
      ];
  const secondaryNav = selectedGameBase
    ? [
        { to: `${selectedGameBase}/watchlist`, label: t("nav.watchlist") },
        { to: `${selectedGameBase}/transactions`, label: t("nav.transactions") },
        { to: `${selectedGameBase}/analytics`, label: t("nav.analytics") },
        { to: `${selectedGameBase}/market`, label: t("nav.market") },
        { to: `${selectedGameBase}/dashboard`, label: t("nav.dashboard") },
      ]
    : [
        { to: "/watchlist", label: t("nav.watchlist") },
        { to: "/transactions", label: t("nav.transactions") },
        { to: "/analytics", label: t("nav.analytics") },
        { to: "/market", label: t("nav.market") },
        { to: "/dashboard", label: t("nav.dashboard") },
      ];

  const toggleLanguage = () => {
    const next = i18n.language === "ko" ? "en" : "ko";
    localStorage.setItem("lang", next);
    i18n.changeLanguage(next);
  };

  return (
    <>
      <nav className="nav" aria-label={t("common.mainNavigation")}>
        <NavLink to="/games" className="nav-logo" aria-label={t("common.appName")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5" /><path d="M16 7h5" />
          </svg>
        </NavLink>

        <div className="nav-scroll" aria-label={t("common.appSections")}>
          <div className="nav-group">
            {[...primaryNav, ...secondaryNav].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="nav-actions">
          <button
            className="btn"
            onClick={logout}
            style={{
              fontSize: 12,
              padding: "5px 12px",
            }}
          >
            {t("auth.logout")}
          </button>
          <button className="lang-toggle" onClick={toggleLanguage}>
            {i18n.language === "ko" ? "EN" : "한국어"}
          </button>
        </div>
      </nav>
      <main className="main">
        <ErrorBoundary>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/watchlist" element={<ResolveGameRedirect section="watchlist" />} />
              <Route path="/market" element={<Market />} />
              <Route path="/games" element={<Games />} />
              <Route path="/games/new" element={<Games startSetup />} />
              <Route path="/games/:sessionId" element={<SessionGuard />}>
                <Route index element={<Game />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="search" element={<SearchStock />} />
                <Route path="exchange" element={<Exchange />} />
                <Route path="watchlist" element={<Watchlist />} />
                <Route path="market" element={<Market />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="analytics" element={<Analytics />} />
              </Route>
              <Route path="/dashboard" element={<ResolveGameRedirect section="dashboard" />} />
              <Route path="/analytics" element={<ResolveGameRedirect section="analytics" />} />
              <Route path="/search" element={<ResolveGameRedirect section="search" />} />
              <Route path="/portfolio" element={<ResolveGameRedirect section="portfolio" />} />
              <Route path="/exchange" element={<ResolveGameRedirect section="exchange" />} />
              <Route path="/transactions" element={<ResolveGameRedirect section="transactions" />} />
              <Route path="/" element={<ResolveGameRedirect section="status" />} />
              <Route path="*" element={<Navigate to="/games" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/*" element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            } />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;
