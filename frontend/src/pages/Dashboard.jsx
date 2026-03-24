import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'

const API = 'http://127.0.0.1:8000'

function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [account, setAccount] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [showGodMode, setShowGodMode] = useState(false)
  const [godCurrency, setGodCurrency] = useState('KRW')
  const [godAmount, setGodAmount] = useState('')
  const [godMessage, setGodMessage] = useState('')
  const [tradeTicker, setTradeTicker] = useState(null)
  const [sortBy, setSortBy] = useState('pnl_desc')
  const [filterMarket, setFilterMarket] = useState('ALL')

  const fetchData = () => {
    fetch(`${API}/portfolio/account`).then(r => r.json()).then(setAccount)
    fetch(`${API}/portfolio/holdings`).then(r => r.json()).then(setHoldings)
  }

  useEffect(() => { fetchData() }, [])

  const addFunds = async () => {
    setGodMessage('')
    const res = await fetch(`${API}/admin/add-funds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: godCurrency, amount: parseFloat(godAmount) }),
    })
    if (res.ok) {
      setGodMessage(`+${godCurrency === 'KRW' ? '₩' : '$'}${parseFloat(godAmount).toLocaleString()} added`)
      setGodAmount('')
      fetchData()
    }
  }

  const removeFunds = async () => {
    setGodMessage('')
    const res = await fetch(`${API}/admin/remove-funds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: godCurrency, amount: parseFloat(godAmount) }),
    })
    const data = await res.json()
    if (res.ok) {
      setGodMessage(`-${godCurrency === 'KRW' ? '₩' : '$'}${parseFloat(godAmount).toLocaleString()} removed`)
      setGodAmount('')
      fetchData()
    } else {
      setGodMessage(data.detail)
    }
  }

  if (!account) return <p>{t('common.loading')}</p>

  const formatKRW = v => `₩${Math.round(v).toLocaleString()}`

  const changeBlock = (label, pct, krw) => {
    if (pct === null || pct === undefined) return (
      <div className="change-item">
        <span className="change-label">{label}</span>
        <span className="change-value">-</span>
      </div>
    )
    return (
      <div className="change-item">
        <span className="change-label">{label}</span>
        <span className={`change-value ${pct >= 0 ? 'positive' : 'negative'}`}>
          {pct >= 0 ? '+' : ''}{pct}%
        </span>
        <span className={`change-amount ${pct >= 0 ? 'positive' : 'negative'}`}>
          {krw !== null ? formatKRW(Math.abs(krw)) : ''}
        </span>
      </div>
    )
  }

  let filtered = holdings
  if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)

  const sorted = [...filtered].sort((a, b) => {
    const pnlPctA = a.avg_price ? ((a.current_price - a.avg_price) / a.avg_price * 100) : 0
    const pnlPctB = b.avg_price ? ((b.current_price - b.avg_price) / b.avg_price * 100) : 0
    switch (sortBy) {
      case 'pnl_desc': return pnlPctB - pnlPctA
      case 'pnl_asc': return pnlPctA - pnlPctB
      case 'name': return getStockName(a.ticker, a.name).localeCompare(getStockName(b.ticker, b.name))
      case 'value_desc': return b.total_value - a.total_value
      default: return 0
    }
  })

  return (
    <div>
      <div className="card hero-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="hero-label">{t('dashboard.totalValue')}</div>
            <div className="hero-value">{formatKRW(account.total_value_krw)}</div>
            <div className={`hero-return ${account.total_return_pct >= 0 ? 'positive' : 'negative'}`}>
              {account.total_return_pct >= 0 ? '+' : ''}{account.total_return_pct}% all time
              <span style={{ marginLeft: 8 }}>
                ({account.total_return_pct >= 0 ? '+' : ''}{formatKRW(account.change_all_krw)})
              </span>
            </div>
          </div>
          <button className="btn god-mode-btn" onClick={() => setShowGodMode(!showGodMode)}>
            God Mode
          </button>
        </div>

        <div className={`daily-pnl ${account.daily_change_pct >= 0 ? 'daily-positive' : 'daily-negative'}`}>
          <span>Today</span>
          <span style={{ fontWeight: 600 }}>
            {account.daily_change_pct >= 0 ? '+' : ''}{formatKRW(account.daily_change_krw)} ({account.daily_change_pct >= 0 ? '+' : ''}{account.daily_change_pct}%)
          </span>
        </div>

        <div className="change-grid">
          {changeBlock('1W', account.change_1w, account.change_1w_krw)}
          {changeBlock('1M', account.change_1m, account.change_1m_krw)}
          {changeBlock('1Y', account.change_1y, account.change_1y_krw)}
          {changeBlock('ALL', account.change_all, account.change_all_krw)}
        </div>
      </div>

      {showGodMode && (
        <div className="card god-mode-panel">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {['KRW', 'USD'].map(c => (
                <button key={c} className="btn" onClick={() => setGodCurrency(c)} style={{
                  fontSize: 13, padding: '6px 12px',
                  background: godCurrency === c ? 'var(--text-primary)' : 'transparent',
                  color: godCurrency === c ? 'var(--bg-primary)' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}>{c}</button>
              ))}
            </div>
            <input className="input" type="number" placeholder="Amount" value={godAmount}
              onChange={e => setGodAmount(e.target.value)} style={{ width: 140 }} />
            <button className="btn btn-buy" style={{ fontSize: 13 }} onClick={addFunds}>+ Add</button>
            <button className="btn btn-sell" style={{ fontSize: 13 }} onClick={removeFunds}>- Remove</button>
          </div>
          {godMessage && <p style={{ marginTop: 8, fontSize: 13, color: godMessage.startsWith('+') ? '#34c759' : '#ff3b30' }}>{godMessage}</p>}
        </div>
      )}

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.holdings')}</div>
          <div className="metric-value">{formatKRW(account.holdings_value_total_krw)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashKRW')}</div>
          <div className="metric-value">{formatKRW(account.balance_krw)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashUSD')}</div>
          <div className="metric-value">${account.balance_usd.toFixed(2)}</div>
        </div>
      </div>

      <div className="exchange-rate-note">
        {t('dashboard.exchangeRate')}: ₩{account.exchange_rate.toLocaleString()} / $1
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('dashboard.holdings')} ({holdings.length})</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <select className="input filter-select" value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
              <option value="ALL">All</option>
              <option value="US">US</option>
              <option value="KRX">KRX</option>
            </select>
            <select className="input filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="pnl_desc">Best P&L</option>
              <option value="pnl_asc">Worst P&L</option>
              <option value="name">A → Z</option>
              <option value="value_desc">Value ↓</option>
            </select>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="empty-state">
            <p>{holdings.length === 0 ? t('stock.notFound') : 'No stocks in this filter'}</p>
            {holdings.length === 0 && (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/search')}>
                {t('nav.search')}
              </button>
            )}
          </div>
        ) : (
          sorted.map(h => {
            const fmt = v => h.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
            const pnlPct = h.avg_price ? ((h.current_price - h.avg_price) / h.avg_price * 100).toFixed(2) : 0
            const name = getStockName(h.ticker, h.name)

            return (
              <div key={h.ticker} className="holding-row" onClick={() => setTradeTicker(h.ticker)}>
                <div>
                  <strong style={{ fontSize: 15 }}>{name}</strong>
                  <div className="holding-sub">{h.ticker} · {h.quantity} shares</div>
                </div>
                <div style={{ textAlign: 'right' }}>
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