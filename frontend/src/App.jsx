import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useContext } from "react";
import { UserContext } from "./context/UserContext";
import ProfileSelect from "./pages/ProfileSelect";
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
import "./App.css";

// App.jsx is the main component that renders the entire application

function App() {
  const { t, i18n } = useTranslation();
  const { currentUserId, setCurrentUserId } = useContext(UserContext);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === "ko" ? "en" : "ko");
  };

  // If no user is selected, show the Profile Selection screen
  if (!currentUserId) {
    return (
      <div className="app">
        <ProfileSelect />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <div className="nav-left">
            <span className="nav-logo">♔ {t("common.appName")}</span>

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
            <NavLink to="/" className="nav-link">
              {t("nav.game") || "Game"}
            </NavLink>
          </div>

          {/* Right-side controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className="btn"
              onClick={() => setCurrentUserId(null)}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                border: "2px solid var(--border)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "1.5px",
              }}
            >
              {t("nav.myGames")}
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
              <Route path="/" element={<Game />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
