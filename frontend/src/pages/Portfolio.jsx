import { apiFetch } from '../api'
import { useState, useEffect, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'
import { formatMoney, formatMarketCap } from '../utils/formatters'
import SortSelect from '../components/SortSelect'
import MarketFilter from '../components/MarketFilter'
import { UserContext } from '../context/UserContext'


function Portfolio() {
  const { t, i18n } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [account, setAccount] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [sortBy, setSortBy] = useState('alloc_desc')
  const [filterMarket, setFilterMarket] = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [tradeTicker, setTradeTicker] = useState(null)

  const fetchData = async () => {
    const [holdingsData, accountData] = await Promise.all([
      apiFetch(`/portfolio/holdings?user_id=${currentUserId}`),
      apiFetch(`/portfolio/account?user_id=${currentUserId}`)
    ])
    if (holdingsData) setHoldings(holdingsData)
    if (accountData) setAccount(accountData)
  }

  useEffect(() => { fetchData() }, [currentUserId])

  if (!account || holdings.length === 0) {
    return <div className="empty-state">{t('stock.notFound')}</div>
  }

  const sorted = useMemo(() => {
    let filtered = holdings
    if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)
    if (filterSector !== 'ALL') filtered = filtered.filter(h => h.sector === filterSector)
    return [...filtered].sort((a, b) => {
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
  }, [holdings, filterMarket, filterSector, sortBy, account.exchange_rate, i18n.language])

  const totalByMarket = useMemo(() => holdings.reduce((acc, h) => {
    const key = h.market
    if (!acc[key]) acc[key] = { value: 0, pnl: 0 }
    acc[key].value += h.total_value
    acc[key].pnl += h.unrealized_pnl
    return acc
  }, {}), [holdings])

  const totalBySector = useMemo(() => holdings.reduce((acc, h) => {
    if (!acc[h.sector]) acc[h.sector] = { value: 0, pnl: 0, count: 0 }
    acc[h.sector].value += h.total_value
    acc[h.sector].pnl += h.unrealized_pnl
    acc[h.sector].count++
    return acc
  }, {}), [holdings])

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
              background: 'var(--bg-secondary)', borderRadius: 10, padding: '8px 14px',
              fontSize: 13, cursor: 'pointer',
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
        <MarketFilter value={filterMarket} onChange={e => setFilterMarket(e.target.value)} style={{ minWidth: 100 }} />
        <SortSelect value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: 120 }} />
      </div>

      <div className="card">
        {sorted.map(h => {
          const fmt = v => formatMoney(v, h.currency)
          const pnlPct = h.avg_price ? ((h.current_price - h.avg_price) / h.avg_price * 100).toFixed(2) : 0
          const name = getStockName(h.ticker, h.name, i18n.language)
          const isPositive = h.unrealized_pnl >= 0

          // Calculate Portfolio Weight (Allocation %)
          const hValKRW = h.currency === 'USD' ? h.total_value * account.exchange_rate : h.total_value
          const allocPct = ((hValKRW / account.total_value_krw) * 100).toFixed(1)

          return (
            <div key={h.ticker} onClick={() => setTradeTicker(h.ticker)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 0', borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 15 }}>{name}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}% {t('holdings.ofPortfolio')}</span> · {h.ticker} · {h.sector}
                </div>
              </div>

              <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 13 }}>{h.quantity} {t('holdings.shares')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cap: {formatMarketCap(h.market_cap, h.currency)}</div>
              </div>

              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(h.current_price)}</div>
                <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                  {isPositive ? '+' : ''}{fmt(h.unrealized_pnl)} ({pnlPct}%)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('holdings.avgPrice')} {fmt(h.avg_price)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {tradeTicker && (
        <TradeModal ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null); fetchData() }} />
      )}
    </div>
  )
}

export default Portfolio