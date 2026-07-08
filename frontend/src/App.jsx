import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useContext } from "react";
import { UserContext } from "./context/userContext";
import { isAuthenticated } from "./auth";
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

function AppLayout() {
  const { t, i18n } = useTranslation();
  const { logout } = useContext(UserContext);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === "ko" ? "en" : "ko");
  };

  return (
    <>
      <nav className="nav">
        <div className="nav-left">
          <span className="nav-logo">{t("common.appName")}</span>

          <NavLink to="/dashboard" className="nav-link">
            {t("nav.dashboard")}
          </NavLink>
          <NavLink to="/analytics" className="nav-link">
            {t("nav.analytics") || "Analytics"}
          </NavLink>
          <NavLink to="/search" className="nav-link">
            {t("nav.search")}
          </NavLink>
          <NavLink to="/portfolio" className="nav-link">
            {t("nav.portfolio")}
          </NavLink>
          <NavLink to="/watchlist" className="nav-link">
            {t("nav.watchlist")}
          </NavLink>
          <NavLink to="/market" className="nav-link">
            {t("nav.market") || "Top 30"}
          </NavLink>
          <NavLink to="/exchange" className="nav-link">
            {t("nav.exchange")}
          </NavLink>
          <NavLink to="/transactions" className="nav-link">
            {t("nav.transactions")}
          </NavLink>
          <NavLink to="/games" className="nav-link">
            {t("nav.myGames")}
          </NavLink>
          <NavLink to="/" className="nav-link">
            {t("nav.game") || "Game"}
          </NavLink>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/search" element={<SearchStock />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/market" element={<Market />} />
            <Route path="/exchange" element={<Exchange />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/games" element={<Games />} />
            <Route path="/" element={<Game />} />
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
