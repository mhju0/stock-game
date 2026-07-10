import { apiPost } from '../api'
import { useState, useEffect, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'
import { formatMoney } from '../utils/formatters'
import SortSelect from '../components/SortSelect'
import MarketFilter from '../components/MarketFilter'
import { UserContext } from '../context/userContext'
import { useAccountQuery, useHoldingsQuery, queryKeys } from '../query/queries'
import { gamePath, isSessionEnded } from '../sessionRoutes'


function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const { session } = useOutletContext() || {}
  const { currentUserId } = useContext(UserContext)
  const tradeDisabledReason = isSessionEnded(session) ? t('game.tradeUnavailableEnded') : ''
  const queryClient = useQueryClient()
  const enableDevTools = import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true'

  const [showDevTools, setShowDevTools] = useState(false)
  const [devCurrency, setDevCurrency] = useState('KRW')
  const [devAmount, setDevAmount] = useState('')
  const [devMessage, setDevMessage] = useState('')
  const [tradeTicker, setTradeTicker] = useState(null)
  const [sortBy, setSortBy] = useState('alloc_desc')
  const [displayCurrency, setDisplayCurrency] = useState('KRW')
  const [filterMarket, setFilterMarket] = useState('ALL')
  const [error, setError] = useState('')

  const { data: account, isLoading: accountLoading, isError: accountError } = useAccountQuery(currentUserId, sessionId)
  const { data: holdings, isLoading: holdingsLoading, isError: holdingsError } = useHoldingsQuery(currentUserId, sessionId)
  const holdingsSafe = useMemo(() => Array.isArray(holdings) ? holdings : [], [holdings])

  const fetchData = () => {
    setError('')
    queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId, sessionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId, sessionId) })
  }

  useEffect(() => { setError('') }, [currentUserId, sessionId])

  const addFunds = async () => {
    setDevMessage('')
    const data = await apiPost(
      `/admin/add-funds?user_id=${currentUserId}`,
      { currency: devCurrency, amount: parseFloat(devAmount) },
      (err) => setDevMessage(err)
    )
    if (data) {
      setDevMessage(`+${devCurrency === 'KRW' ? '₩' : '$'}${parseFloat(devAmount).toLocaleString()} added`)
      setDevAmount('')
      fetchData()
    }
  }

  const removeFunds = async () => {
    setDevMessage('')
    const data = await apiPost(
      `/admin/remove-funds?user_id=${currentUserId}`,
      { currency: devCurrency, amount: parseFloat(devAmount) },
      (err) => setDevMessage(err)
    )
    if (data) {
      setDevMessage(`-${devCurrency === 'KRW' ? '₩' : '$'}${parseFloat(devAmount).toLocaleString()} removed`)
      setDevAmount('')
      fetchData()
    }
  }

  const sorted = useMemo(() => {
    let filtered = holdingsSafe
    if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)
    return [...filtered].sort((a, b) => {
      // Standardize everything to KRW to calculate true Value and Allocation sorts
      const rate = account?.exchange_rate || 1350
      const aValKRW = a.currency === 'USD' ? a.total_value * rate : a.total_value
      const bValKRW = b.currency === 'USD' ? b.total_value * rate : b.total_value

      switch (sortBy) {
        case 'name_asc':
          return getStockName(a.ticker, a.name, i18n.language).localeCompare(getStockName(b.ticker, b.name, i18n.language))
        case 'name_desc':
          return getStockName(b.ticker, b.name, i18n.language).localeCompare(getStockName(a.ticker, a.name, i18n.language))
        case 'alloc_desc':
        case 'value_desc':
          return bValKRW - aValKRW
        case 'alloc_asc':
        case 'value_asc':
          return aValKRW - bValKRW
        case 'pnl_desc':
          return b.unrealized_pnl - a.unrealized_pnl
        case 'pnl_asc':
          return a.unrealized_pnl - b.unrealized_pnl
        case 'mcap_desc':
          return (b.market_cap || 0) - (a.market_cap || 0)
        case 'mcap_asc':
          return (a.market_cap || 0) - (b.market_cap || 0)
        default:
          return 0
      }
    })
  }, [holdingsSafe, filterMarket, sortBy, account?.exchange_rate, i18n.language])

  if (error) return <div className="card" style={{ color: 'var(--negative)', textAlign: 'center' }}>{error}</div>
  if (accountLoading || holdingsLoading) return <p>{t('common.loading')}</p>
  if (accountError || holdingsError || !account || !Array.isArray(holdings)) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
      <button className="btn btn-primary" onClick={fetchData}>{t('common.retry')}</button>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate(gamePath(sessionId))}>
            {t('dashboard.viewGame')}
          </button>
          <button type="button" className="btn" onClick={() => navigate('/games')}>
            {t('dashboard.viewGames')}
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="metric-label" style={{ marginBottom: 0 }}>{t('dashboard.totalValue')}</div>
            <div style={{ display: 'flex', gap: 2 }}>
              {['KRW', 'USD'].map(c => (
                <button key={c} className={`btn segmented-button ${displayCurrency === c ? 'segmented-button-selected' : ''}`} onClick={() => setDisplayCurrency(c)} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 6,
                  lineHeight: '16px',
                }}>{c === 'KRW' ? '₩' : '$'}</button>
              ))}
            </div>
          </div>
          <div className="metric-value">
            {displayCurrency === 'KRW'
              ? formatMoney(account.total_value_krw, 'KRW')
              : `$${(account.total_value_krw / (account.exchange_rate || 1350)).toFixed(2)}`}
          </div>
          <div className={account.daily_change_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
            {account.daily_change_pct >= 0 ? '+' : ''}{account.daily_change_pct}% {t('dashboard.today')}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.holdingsValue')}</div>
          <div className="metric-value">
            {displayCurrency === 'KRW'
              ? formatMoney(account.holdings_value_total_krw, 'KRW')
              : `$${(account.holdings_value_total_krw / (account.exchange_rate || 1350)).toFixed(2)}`}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashKRW')}</div>
          <div className="metric-value">{formatMoney(account.balance_krw, 'KRW')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashUSD')}</div>
          <div className="metric-value">${(account.balance_usd ?? 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 6 }}>{t('dashboard.nextActionTitle')}</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            {holdingsSafe.length === 0 ? t('dashboard.nextActionNoHoldings') : t('dashboard.nextActionHasHoldings')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {holdingsSafe.length === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate(gamePath(sessionId, 'search'))}>
              {t('nav.search')}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => navigate(gamePath(sessionId, 'portfolio'))}>
                {t('dashboard.viewPortfolio')}
              </button>
              <button type="button" className="btn" onClick={() => navigate(gamePath(sessionId, 'analytics'))}>
                {t('dashboard.viewAnalytics')}
              </button>
            </>
          )}
        </div>
      </div>

      {enableDevTools && (
        <button className="btn" onClick={() => setShowDevTools(!showDevTools)} style={{ marginBottom: 16, fontSize: 12, border: '1px solid var(--border)' }}>
          {showDevTools ? t('dashboard.devToolsHide') : t('dashboard.devTools')}
        </button>
      )}

      {enableDevTools && showDevTools && (
        <div className="card" style={{ marginBottom: 16, border: '1px dashed #007aff' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" style={{ width: 100 }} value={devCurrency} onChange={e => setDevCurrency(e.target.value)}>
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
            </select>
            <input className="input" type="number" placeholder="Amount..." value={devAmount} onChange={e => setDevAmount(e.target.value)} />
            <button className="btn btn-buy" onClick={addFunds}>Add</button>
            <button className="btn btn-sell" onClick={removeFunds}>Remove</button>
          </div>
          {devMessage && <p style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>{devMessage}</p>}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('dashboard.myHoldings')}</div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <MarketFilter value={filterMarket} onChange={e => setFilterMarket(e.target.value)} />
            
            <SortSelect value={sortBy} onChange={e => setSortBy(e.target.value)} />
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="empty-state">
            <p>{holdingsSafe.length === 0 ? t('portfolio.emptyTitle') : t('dashboard.noHoldingsForFilter')}</p>
            {filterMarket === 'ALL' && (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate(gamePath(sessionId, 'search'))}>
                {t('nav.search')}
              </button>
            )}
          </div>
        ) : (
          sorted.map(h => {
            const fmt = v => formatMoney(v, h.currency)
            const pnlPct = h.avg_price ? ((h.current_price - h.avg_price) / h.avg_price * 100).toFixed(2) : 0
            const name = getStockName(h.ticker, h.name, i18n.language)
            
            // Calculate Portfolio Weight (Allocation %)
            const hValKRW = h.currency === 'USD' ? h.total_value * (account?.exchange_rate || 1350) : h.total_value
            const allocPct = ((hValKRW / (account.total_value_krw || 1)) * 100).toFixed(1)

            return (
              <button
                key={h.ticker}
                type="button"
                className="holding-row"
                onClick={() => setTradeTicker(h.ticker)}
                aria-label={`${name} ${t('stock.openTrade')}`}
              >
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>{name}</strong>
                  <div className="holding-sub">
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}% {t('holdings.ofPortfolio')}</span> · {h.ticker}
                  </div>
                </div>
                
                <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 13 }}>{t('holdings.shares', { count: h.quantity })}</div>
                    {h.sector && <div className="holding-sub">{h.sector}</div>}
                </div>

                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(h.current_price)}</div>
                  <div className={h.unrealized_pnl >= 0 ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                    {h.unrealized_pnl >= 0 ? '+' : ''}{pnlPct}%
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          sessionId={sessionId}
          tradeDisabledReason={tradeDisabledReason}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null); fetchData() }}
        />
      )}
    </div>
  )
}

export default Dashboard
