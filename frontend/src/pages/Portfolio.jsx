import { apiFetch } from '../api'
import { useState, useEffect, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'
import { formatMoney } from '../utils/formatters'
import SortSelect from '../components/SortSelect'
import MarketFilter from '../components/MarketFilter'
import { UserContext } from '../context/UserContext'


function Portfolio() {
  const { t, i18n } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [account, setAccount] = useState(null)
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('alloc_desc')
  const [filterMarket, setFilterMarket] = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [displayCurrency, setDisplayCurrency] = useState('KRW')
  const [tradeTicker, setTradeTicker] = useState(null)

  const fetchData = async () => {
    setLoading(true)
    const [holdingsData, accountData] = await Promise.all([
      apiFetch(`/portfolio/holdings?user_id=${currentUserId}`),
      apiFetch(`/portfolio/account?user_id=${currentUserId}`)
    ])
    setHoldings(Array.isArray(holdingsData) ? holdingsData : [])
    setAccount(accountData || null)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [currentUserId])

  const sorted = useMemo(() => {
    let filtered = holdings
    if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)
    if (filterSector !== 'ALL') filtered = filtered.filter(h => h.sector === filterSector)
    return [...filtered].sort((a, b) => {
    const rate = account?.exchange_rate || 1350
    const aValKRW = a.currency === 'USD' ? a.total_value * rate : a.total_value
    const bValKRW = b.currency === 'USD' ? b.total_value * rate : b.total_value

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
  }, [holdings, filterMarket, filterSector, sortBy, account?.exchange_rate, i18n.language])

  const totalByMarket = useMemo(() => holdings.reduce((acc, h) => {
    const key = h.market
    if (!acc[key]) acc[key] = { value: 0, pnl: 0 }
    acc[key].value += h.total_value
    acc[key].pnl += h.unrealized_pnl
    return acc
  }, {}), [holdings])

  const totalBySector = useMemo(() => holdings.reduce((acc, h) => {
    const sectorKey = h.sector
    if (!sectorKey) return acc
    if (!acc[sectorKey]) acc[sectorKey] = { value: 0, pnl: 0, count: 0 }
    acc[sectorKey].value += h.total_value
    acc[sectorKey].pnl += h.unrealized_pnl
    acc[sectorKey].count++
    return acc
  }, {}), [holdings])

  if (loading) return <p>{t('common.loading')}</p>
  if (!account) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>Failed to load portfolio data. Is the backend running?</p>
      <button className="btn btn-primary" onClick={fetchData}>Retry</button>
    </div>
  )
  if (holdings.length === 0) {
    return <div className="empty-state">{t('stock.notFound')}</div>
  }

  return (
    <div>
      <div className="metric-grid">
        {(() => {
          const rate = account?.exchange_rate || 1350
          const krxData = totalByMarket['KRX'] || { value: 0, pnl: 0 }
          const usData = totalByMarket['US'] || { value: 0, pnl: 0 }
          const totalVal = displayCurrency === 'KRW'
            ? krxData.value + (usData.value * rate)
            : (krxData.value / rate) + usData.value
          const totalPnl = displayCurrency === 'KRW'
            ? krxData.pnl + (usData.pnl * rate)
            : (krxData.pnl / rate) + usData.pnl
          const fmtVal = displayCurrency === 'KRW'
            ? `₩${Math.round(totalVal).toLocaleString()}`
            : `$${totalVal.toFixed(2)}`
          const fmtPnl = displayCurrency === 'KRW'
            ? `₩${Math.round(Math.abs(totalPnl)).toLocaleString()}`
            : `$${Math.abs(totalPnl).toFixed(2)}`

          return (
            <>
              <div className="metric-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div className="metric-label" style={{ marginBottom: 0 }}>{t('stock.totalValue')}</div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {['KRW', 'USD'].map(c => (
                      <button key={c} className="btn" onClick={() => setDisplayCurrency(c)} style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        background: displayCurrency === c ? 'var(--text-primary)' : 'transparent',
                        color: displayCurrency === c ? 'var(--bg-primary)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)', lineHeight: '16px',
                      }}>{c === 'KRW' ? '₩' : '$'}</button>
                    ))}
                  </div>
                </div>
                <div className="metric-value">{fmtVal}</div>
                <div className={totalPnl >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
                  {totalPnl >= 0 ? '+' : '-'}{fmtPnl}
                </div>
              </div>
              {Object.entries(totalByMarket).map(([market, data]) => {
                const val = displayCurrency === 'KRW'
                  ? (market === 'KRX' ? data.value : data.value * rate)
                  : (market === 'KRX' ? data.value / rate : data.value)
                const pnl = displayCurrency === 'KRW'
                  ? (market === 'KRX' ? data.pnl : data.pnl * rate)
                  : (market === 'KRX' ? data.pnl / rate : data.pnl)
                const fmtV = displayCurrency === 'KRW'
                  ? `₩${Math.round(val).toLocaleString()}`
                  : `$${val.toFixed(2)}`
                const fmtP = displayCurrency === 'KRW'
                  ? `₩${Math.round(Math.abs(pnl)).toLocaleString()}`
                  : `$${Math.abs(pnl).toFixed(2)}`
                return (
                  <div className="metric-card" key={market}>
                    <div className="metric-label">{market}</div>
                    <div className="metric-value">{fmtV}</div>
                    <div className={pnl >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
                      {pnl >= 0 ? '+' : '-'}{fmtP}
                    </div>
                  </div>
                )
              })}
            </>
          )
        })()}
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
          const hValKRW = h.currency === 'USD' ? h.total_value * (account?.exchange_rate || 1350) : h.total_value
          const allocPct = ((hValKRW / (account.total_value_krw || 1)) * 100).toFixed(1)

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
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}% {t('holdings.ofPortfolio')}</span> · {h.ticker}{h.sector && <> · {h.sector}</>}
                </div>
              </div>

              <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: 13 }}>{h.quantity} {t('holdings.shares')}</div>
                  {h.sector && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.sector}</div>}
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