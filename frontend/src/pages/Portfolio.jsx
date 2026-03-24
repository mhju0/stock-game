import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'

const API = 'http://127.0.0.1:8000'

function Portfolio() {
  const { t } = useTranslation()
  const [holdings, setHoldings] = useState([])
  const [sortBy, setSortBy] = useState('name')
  const [filterMarket, setFilterMarket] = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [tradeTicker, setTradeTicker] = useState(null)

  const fetchHoldings = async () => {
    const res = await fetch(`${API}/portfolio/holdings`)
    const data = await res.json()
    setHoldings(data)
  }

  useEffect(() => { fetchHoldings() }, [])

  if (holdings.length === 0) {
    return <div className="empty-state">{t('stock.notFound')}</div>
  }

  const sectors = [...new Set(holdings.map(h => h.sector))].sort()

  let filtered = holdings
  if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)
  if (filterSector !== 'ALL') filtered = filtered.filter(h => h.sector === filterSector)

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'name': return getStockName(a.ticker, a.name).localeCompare(getStockName(b.ticker, b.name))
      case 'value_desc': return b.total_value - a.total_value
      case 'value_asc': return a.total_value - b.total_value
      case 'pnl_desc': return b.unrealized_pnl - a.unrealized_pnl
      case 'pnl_asc': return a.unrealized_pnl - b.unrealized_pnl
      default: return 0
    }
  })

  const totalByMarket = holdings.reduce((acc, h) => {
    const key = h.market
    if (!acc[key]) acc[key] = { value: 0, pnl: 0 }
    acc[key].value += h.total_value
    acc[key].pnl += h.unrealized_pnl
    return acc
  }, {})

  const totalBySector = holdings.reduce((acc, h) => {
    if (!acc[h.sector]) acc[h.sector] = { value: 0, pnl: 0, count: 0 }
    acc[h.sector].value += h.total_value
    acc[h.sector].pnl += h.unrealized_pnl
    acc[h.sector].count++
    return acc
  }, {})

  return (
    <div>
      <div className="metric-grid">
        {Object.entries(totalByMarket).map(([market, data]) => (
          <div className="metric-card" key={market}>
            <div className="metric-label">{market} {t('stock.totalValue')}</div>
            <div className="metric-value">
              {market === 'KRX' ? `₩${Math.round(data.value).toLocaleString()}` : `$${data.value.toFixed(2)}`}
            </div>
            <div className={data.pnl >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
              {data.pnl >= 0 ? '+' : ''}{market === 'KRX' ? `₩${Math.round(data.pnl).toLocaleString()}` : `$${data.pnl.toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">{t('stock.sector')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(totalBySector).map(([sector, data]) => (
            <div key={sector} style={{
              background: 'var(--bg-secondary)',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
              border: filterSector === sector ? '2px solid #007aff' : '2px solid transparent',
            }}
              onClick={() => setFilterSector(filterSector === sector ? 'ALL' : sector)}
            >
              <div style={{ fontWeight: 600 }}>{sector}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{data.count} stocks</div>
              <div className={data.pnl >= 0 ? 'positive' : 'negative'} style={{ fontSize: 12 }}>
                {data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto', minWidth: 140 }} value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
          <option value="ALL">All Markets</option>
          <option value="US">US</option>
          <option value="KRX">KRX</option>
        </select>
        <select className="input" style={{ width: 'auto', minWidth: 160 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="name">Sort: Name</option>
          <option value="value_desc">Sort: Value ↓</option>
          <option value="value_asc">Sort: Value ↑</option>
          <option value="pnl_desc">Sort: Best P&L</option>
          <option value="pnl_asc">Sort: Worst P&L</option>
        </select>
      </div>

      <div className="card">
        {sorted.map(h => {
          const fmt = v => h.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
          const pnlPct = h.avg_price ? ((h.current_price - h.avg_price) / h.avg_price * 100).toFixed(2) : 0
          const name = getStockName(h.ticker, h.name)
          const isPositive = h.unrealized_pnl >= 0

          return (
            <div key={h.ticker} onClick={() => setTradeTicker(h.ticker)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 0', borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div>
                <strong style={{ fontSize: 15 }}>{name}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.ticker} · {h.sector} · {h.quantity} shares</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(h.current_price)}</div>
                <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                  {isPositive ? '+' : ''}{fmt(h.unrealized_pnl)} ({pnlPct}%)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>avg {fmt(h.avg_price)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {tradeTicker && (
        <TradeModal ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null); fetchHoldings() }} />
      )}
    </div>
  )
}

export default Portfolio