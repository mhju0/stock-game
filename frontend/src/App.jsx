import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Dashboard from './pages/Dashboard'
import SearchStock from './pages/SearchStock'
import Portfolio from './pages/Portfolio'
import Transactions from './pages/Transactions'
import Exchange from './pages/Exchange'
import Watchlist from './pages/Watchlist'
import Market from './pages/Market'
import Analytics from './pages/Analytics'
import Game from './pages/Game'
import './App.css'

function App() {
  const { t, i18n } = useTranslation()

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'ko' ? 'en' : 'ko')
  }

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="nav">
          <div className="nav-left">
            <span className="nav-logo">{t('common.appName')}</span>
            <NavLink to="/" className="nav-link">{t('nav.dashboard')}</NavLink>
            <NavLink to="/analytics" className="nav-link">{t('nav.analytics') || 'Analytics'}</NavLink>
            <NavLink to="/search" className="nav-link">{t('nav.search')}</NavLink>
            <NavLink to="/portfolio" className="nav-link">{t('nav.portfolio')}</NavLink>
            <NavLink to="/watchlist" className="nav-link">{t('nav.watchlist')}</NavLink>
            <NavLink to="/market" className="nav-link">{t('nav.market') || 'Top 30'}</NavLink>
            <NavLink to="/exchange" className="nav-link">{t('nav.exchange')}</NavLink>
            <NavLink to="/transactions" className="nav-link">{t('nav.transactions')}</NavLink>
            <NavLink to="/game" className="nav-link">{t('nav.game') || 'Game'}</NavLink>
          </div>
          <button className="lang-toggle" onClick={toggleLanguage}>
            {i18n.language === 'ko' ? 'EN' : '한국어'}
          </button>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/search" element={<SearchStock />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/market" element={<Market />} />
            <Route path="/exchange" element={<Exchange />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/game" element={<Game />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App

