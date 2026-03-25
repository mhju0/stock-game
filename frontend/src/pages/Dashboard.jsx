import { apiPost } from '../api'
import { useState, useEffect, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'
import { formatMoney, formatMarketCap } from '../utils/formatters'
import SortSelect from '../components/SortSelect'
import MarketFilter from '../components/MarketFilter'
import { UserContext } from '../context/UserContext'
import { useAccountQuery, useHoldingsQuery, queryKeys } from '../query/queries'


function Dashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { currentUserId } = useContext(UserContext)
  const queryClient = useQueryClient()

  const [showGodMode, setShowGodMode] = useState(false)
  const [godCurrency, setGodCurrency] = useState('KRW')
  const [godAmount, setGodAmount] = useState('')
  const [godMessage, setGodMessage] = useState('')
  const [tradeTicker, setTradeTicker] = useState(null)
  const [sortBy, setSortBy] = useState('alloc_desc')
  const [filterMarket, setFilterMarket] = useState('ALL')
  const [error, setError] = useState('')

  const { data: account, isLoading: accountLoading } = useAccountQuery(currentUserId)
  const { data: holdings = [], isLoading: holdingsLoading } = useHoldingsQuery(currentUserId)

  const fetchData = () => {
    setError('')
    queryClient.invalidateQueries({ queryKey: queryKeys.account(currentUserId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.holdings(currentUserId) })
  }

  useEffect(() => { setError('') }, [currentUserId])

  const addFunds = async () => {
    setGodMessage('')
    const data = await apiPost(
      `/admin/add-funds?user_id=${currentUserId}`,
      { currency: godCurrency, amount: parseFloat(godAmount) },
      (err) => setGodMessage(err)
    )
    if (data) {
      setGodMessage(`+${godCurrency === 'KRW' ? '₩' : '$'}${parseFloat(godAmount).toLocaleString()} added`)
      setGodAmount('')
      fetchData()
    }
  }

  const removeFunds = async () => {
    setGodMessage('')
    const data = await apiPost(
      `/admin/remove-funds?user_id=${currentUserId}`,
      { currency: godCurrency, amount: parseFloat(godAmount) },
      (err) => setGodMessage(err)
    )
    if (data) {
      setGodMessage(`-${godCurrency === 'KRW' ? '₩' : '$'}${parseFloat(godAmount).toLocaleString()} removed`)
      setGodAmount('')
      fetchData()
    }
  }

  if (error) return <div className="card" style={{ color: 'var(--negative)', textAlign: 'center' }}>{error}</div>
  if (accountLoading || holdingsLoading || !account) return <p>{t('common.loading')}</p>

  const sorted = useMemo(() => {
    let filtered = holdings
    if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)
    return [...filtered].sort((a, b) => {
    // Standardize everything to KRW to calculate true Value and Allocation sorts
    const aValKRW = a.currency === 'USD' ? a.total_value * account.exchange_rate : a.total_value
    const bValKRW = b.currency === 'USD' ? b.total_value * account.exchange_rate : b.total_value

    switch (sortBy) {
      case 'name_asc': return getStockName(a.ticker, a.name, i18n.language).localeCompare(getStockName(b.ticker, b.name, i18n.language))
      case 'name_desc': return getStockName(b.ticker, b.name, i18n.language).localeCompare(getStockName(a.ticker, a.name, i18n.language))
      case 'alloc_desc': 
      case 'value_desc': return bValKRW - aValKRW
      case 'alloc_asc':
      case 'value_asc': return aValKRW - bValKRW
      case 'pnl_desc': return b.unrealized_pnl - a.unrealized_pnl
      case 'pnl_asc': return a.unrealized_pnl - b.unrealized_pnl
      case 'mcap_desc': return (b.market_cap || 0) - (a.market_cap || 0)
      case 'mcap_asc': return (a.market_cap || 0) - (b.market_cap || 0)
      default: return 0
    }
    })
  }, [holdings, filterMarket, sortBy, account.exchange_rate, i18n.language])

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.totalValue')}</div>
          <div className="metric-value">{formatMoney(account.total_value_krw, 'KRW')}</div>
          <div className={account.daily_change_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
            {account.daily_change_pct >= 0 ? '+' : ''}{account.daily_change_pct}% {t('dashboard.today')}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.holdingsValue')}</div>
          <div className="metric-value">{formatMoney(account.holdings_value_total_krw, 'KRW')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashKRW')}</div>
          <div className="metric-value">{formatMoney(account.balance_krw, 'KRW')}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashUSD')}</div>
          <div className="metric-value">${account.balance_usd.toFixed(2)}</div>
        </div>
      </div>

      <button className="btn" onClick={() => setShowGodMode(!showGodMode)} style={{ marginBottom: 16, fontSize: 12, border: '1px solid var(--border)' }}>
        {showGodMode ? t('dashboard.godModeHide') : t('dashboard.godMode')}
      </button>

      {showGodMode && (
        <div className="card" style={{ marginBottom: 16, border: '1px dashed #007aff' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" style={{ width: 100 }} value={godCurrency} onChange={e => setGodCurrency(e.target.value)}>
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
            </select>
            <input className="input" type="number" placeholder="Amount..." value={godAmount} onChange={e => setGodAmount(e.target.value)} />
            <button className="btn btn-buy" onClick={addFunds}>Add</button>
            <button className="btn btn-sell" onClick={removeFunds}>Remove</button>
          </div>
          {godMessage && <p style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)' }}>{godMessage}</p>}
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
            <p>{t('stock.notFound')}</p>
            {filterMarket === 'ALL' && (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/search')}>
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
            const hValKRW = h.currency === 'USD' ? h.total_value * account.exchange_rate : h.total_value
            const allocPct = ((hValKRW / account.total_value_krw) * 100).toFixed(1)

            return (
              <div key={h.ticker} className="holding-row" onClick={() => setTradeTicker(h.ticker)}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>{name}</strong>
                  <div className="holding-sub">
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}% {t('holdings.ofPortfolio')}</span> · {h.ticker}
                  </div>
                </div>
                
                <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 13 }}>{h.quantity} {t('holdings.shares')}</div>
                    <div className="holding-sub">Cap: {formatMarketCap(h.market_cap, h.currency)}</div>
                </div>

                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(h.current_price)}</div>
                  <div className={h.unrealized_pnl >= 0 ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                    {h.unrealized_pnl >= 0 ? '+' : ''}{pnlPct}%
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null); fetchData() }}
        />
      )}
    </div>
  )
}

export default Dashboard