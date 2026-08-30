import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { lazy, Suspense, useContext, useEffect } from "react";
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

function NavGlyph({ name }) {
  const paths = {
    games: <><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M8 9h8M8 13h5" /></>,
    game: <><path d="M4 17V9M10 17V5M16 17v-7M22 17V7" /><path d="M2 19h22" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 5 5" /></>,
    portfolio: <><path d="M4 8h16v11H4z" /><path d="M8 8V5h8v3M4 12h16" /></>,
    analytics: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V7" /></>,
    watchlist: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    market: <><path d="M3 18h18M5 15l4-4 3 2 6-7" /><path d="M15 6h3v3" /></>,
    exchange: <><path d="M5 7h13l-3-3M19 17H6l3 3" /></>,
    transactions: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  };

  return (
    <svg className="nav-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function AppLayout() {
  const { t, i18n } = useTranslation();
  const { logout } = useContext(UserContext);
  const location = useLocation();
  const sessionId = getSessionIdFromPath(location.pathname);
  const selectedGameBase = sessionId ? `/games/${sessionId}` : null;

  useEffect(() => {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname]);

  const primaryNav = selectedGameBase
    ? [
        { to: "/games", label: t("nav.myGames"), icon: "games", end: true },
        { to: selectedGameBase, label: t("nav.game"), icon: "game", end: true },
        { to: `${selectedGameBase}/search`, label: t("nav.trade"), icon: "search" },
        { to: `${selectedGameBase}/portfolio`, label: t("nav.portfolio"), icon: "portfolio" },
        { to: `${selectedGameBase}/analytics`, label: t("nav.analytics"), icon: "analytics" },
      ]
    : [
        { to: "/games", label: t("nav.myGames"), icon: "games", end: true },
        { to: "/", label: t("nav.game"), icon: "game", end: true },
        { to: "/search", label: t("nav.trade"), icon: "search" },
        { to: "/portfolio", label: t("nav.portfolio"), icon: "portfolio" },
        { to: "/analytics", label: t("nav.analytics"), icon: "analytics" },
      ];
  const secondaryNav = selectedGameBase
    ? [
        { to: `${selectedGameBase}/watchlist`, label: t("nav.watchlist"), icon: "watchlist" },
        { to: `${selectedGameBase}/market`, label: t("nav.market"), icon: "market" },
        { to: `${selectedGameBase}/exchange`, label: t("nav.exchange"), icon: "exchange" },
        { to: `${selectedGameBase}/transactions`, label: t("nav.transactions"), icon: "transactions" },
        { to: `${selectedGameBase}/dashboard`, label: t("nav.dashboard"), icon: "dashboard" },
      ]
    : [
        { to: "/watchlist", label: t("nav.watchlist"), icon: "watchlist" },
        { to: "/market", label: t("nav.market"), icon: "market" },
        { to: "/exchange", label: t("nav.exchange"), icon: "exchange" },
        { to: "/transactions", label: t("nav.transactions"), icon: "transactions" },
        { to: "/dashboard", label: t("nav.dashboard"), icon: "dashboard" },
      ];

  const toggleLanguage = () => {
    const next = i18n.language === "ko" ? "en" : "ko";
    localStorage.setItem("lang", next);
    i18n.changeLanguage(next);
  };

  const closeMobileMore = (event) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
  };
  const mobileMoreItems = [primaryNav[4], ...secondaryNav];
  const mobileMoreActive = mobileMoreItems.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t("common.skipToContent")}</a>

      <aside className="app-sidebar">
        <NavLink to="/games" className="sidebar-brand" aria-label={t("common.appName")}>
          <span className="nav-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5" /><path d="M16 7h5" />
            </svg>
          </span>
          <span>{t("common.appName")}</span>
        </NavLink>

        <nav className="sidebar-nav" aria-label={t("common.mainNavigation")}>
          <div className="sidebar-section">
            <div className="sidebar-label">{t("nav.primary")}</div>
            {primaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                <NavGlyph name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">{t("nav.tools")}</div>
            {secondaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link nav-link-secondary">
                <NavGlyph name={item.icon} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="sidebar-actions">
          <button className="lang-toggle" onClick={toggleLanguage}>
            {i18n.language === "ko" ? "EN" : "한국어"}
          </button>
          <button className="btn sidebar-logout" onClick={logout}>{t("auth.logout")}</button>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="mobile-header">
          <NavLink to="/games" className="sidebar-brand" aria-label={t("common.appName")}>
            <span className="nav-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-8" /><path d="M21 7v5" /><path d="M16 7h5" />
              </svg>
            </span>
            <span>{t("common.appName")}</span>
          </NavLink>
          <button className="lang-toggle" onClick={toggleLanguage}>
            {i18n.language === "ko" ? "EN" : "한국어"}
          </button>
        </header>

        <main id="main-content" className="main" tabIndex={-1}>
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

        <nav className="mobile-tabbar" aria-label={t("common.mainNavigation")}>
          {primaryNav.slice(0, 4).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="mobile-tab">
              <NavGlyph name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <details className="mobile-more">
            <summary className={`mobile-tab ${mobileMoreActive ? "active" : ""}`}>
              <NavGlyph name="more" />
              <span>{t("nav.more")}</span>
            </summary>
            <div className="mobile-more-menu">
              {mobileMoreItems.map((item) => (
                <NavLink key={item.to} to={item.to} className="mobile-more-link" onClick={closeMobileMore}>
                  <NavGlyph name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <button className="mobile-more-link mobile-logout" onClick={logout}>{t("auth.logout")}</button>
            </div>
          </details>
        </nav>
      </div>
    </div>
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
