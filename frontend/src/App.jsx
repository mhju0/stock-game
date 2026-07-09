import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useContext, useEffect, useState } from "react";
import { UserContext } from "./context/userContext";
import { isAuthenticated } from "./auth";
import { apiFetch } from "./api";
import { gamePath, getSessionIdFromPath, sessionStatusLabelKey } from "./sessionRoutes";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import SearchStock from "./pages/SearchStock";
import Portfolio from "./pages/Portfolio";
import Transactions from "./pages/Transactions";
import Exchange from "./pages/Exchange";
import Watchlist from "./pages/Watchlist";
import Market from "./pages/Market";
import Analytics from "./pages/Analytics";
import ErrorBoundary from "./components/ErrorBoundary";
import Game from "./pages/Game";
import Games from "./pages/Games";
import "./App.css";

function RequireAuth({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function ResolveGameRedirect({ section = "status" }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/game/sessions").then((data) => {
      if (cancelled) return;
      const session = Array.isArray(data?.sessions) ? data.sessions[0] : null;
      setTarget(session?.id ? gamePath(session.id, section) : "/games");
    });
    return () => { cancelled = true; };
  }, [section]);

  if (target) return <Navigate to={target} replace />;
  return <p>{t("common.loading")}</p>;
}

function SessionGuard() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(`/game/sessions/${sessionId}`, {}, setError).then((data) => {
      if (cancelled) return;
      setSession(data?.session || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) return <p>{t("common.loading")}</p>;

  if (!session) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40 }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>{t("games.notFoundTitle")}</h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
          {error || t("games.notFoundBody")}
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
              color: session.status === "active" && !session.is_expired ? "var(--positive)" : "var(--text-secondary)",
              background: session.status === "active" && !session.is_expired ? "var(--positive-bg)" : "var(--bg-secondary)",
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
        { to: "/watchlist", label: t("nav.watchlist") },
        { to: `${selectedGameBase}/transactions`, label: t("nav.transactions") },
        { to: `${selectedGameBase}/analytics`, label: t("nav.analytics") },
        { to: "/market", label: t("nav.market") },
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
    i18n.changeLanguage(i18n.language === "ko" ? "en" : "ko");
  };

  return (
    <>
      <nav className="nav" aria-label={t("common.mainNavigation")}>
        <NavLink to="/games" className="nav-logo">
          {t("common.appName")}
        </NavLink>

        <div className="nav-scroll" aria-label={t("common.appSections")}>
          <div className="nav-group nav-group-primary">
            {primaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="nav-group nav-group-secondary">
            {secondaryNav.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link">
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
          <Routes>
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/market" element={<Market />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/new" element={<Games startSetup />} />
            <Route path="/games/:sessionId" element={<SessionGuard />}>
              <Route index element={<Game />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="search" element={<SearchStock />} />
              <Route path="exchange" element={<Exchange />} />
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
        </ErrorBoundary>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/*" element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
