import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'
import { formatMoney } from '../utils/formatters'
import SortSelect from '../components/SortSelect'
import MarketFilter from '../components/MarketFilter'
import { useAccountQuery, useHoldingsQuery } from '../query/queries'
import { gamePath, isSessionEnded } from '../sessionRoutes'


function Portfolio() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const { session } = useOutletContext() || {}
  const tradeDisabledReason = isSessionEnded(session) ? t('game.tradeUnavailableEnded') : ''
  
  const [sortBy, setSortBy] = useState('alloc_desc')
  const [filterMarket, setFilterMarket] = useState('ALL')
  const [filterSector, setFilterSector] = useState('ALL')
  const [displayCurrency, setDisplayCurrency] = useState('KRW')
  const [tradeTicker, setTradeTicker] = useState(null)

  const accountQuery = useAccountQuery()
  const holdingsQuery = useHoldingsQuery()
  const account = accountQuery.data || null
  const holdings = useMemo(
    () => Array.isArray(holdingsQuery.data) ? holdingsQuery.data : [],
    [holdingsQuery.data],
  )
  const loading = accountQuery.isLoading || holdingsQuery.isLoading ||
    (accountQuery.isFetching && accountQuery.data === undefined) ||
    (holdingsQuery.isFetching && holdingsQuery.data === undefined)

  const fetchData = () => {
    accountQuery.refetch()
    holdingsQuery.refetch()
  }

  const sorted = useMemo(() => {
    let filtered = holdings
    if (filterMarket !== 'ALL') filtered = filtered.filter(h => h.market === filterMarket)
    if (filterSector !== 'ALL') filtered = filtered.filter(h => h.sector === filterSector)
    return [...filtered].sort((a, b) => {
    const rate = account?.exchange_rate
    const aValKRW = Number.isFinite(a.total_value) && (a.currency !== 'USD' || rate > 0) ? a.currency === 'USD' ? a.total_value * rate : a.total_value : null
    const bValKRW = Number.isFinite(b.total_value) && (b.currency !== 'USD' || rate > 0) ? b.currency === 'USD' ? b.total_value * rate : b.total_value : null

    switch (sortBy) {
      case 'name_asc': return getStockName(a.ticker, a.name, i18n.language).localeCompare(getStockName(b.ticker, b.name, i18n.language))
      case 'name_desc': return getStockName(b.ticker, b.name, i18n.language).localeCompare(getStockName(a.ticker, a.name, i18n.language))
      case 'alloc_desc': 
      case 'value_desc':
      case 'alloc_asc':
      case 'value_asc':
        if (!Number.isFinite(aValKRW) || !Number.isFinite(bValKRW)) return Number(Number.isFinite(bValKRW)) - Number(Number.isFinite(aValKRW))
        return sortBy.endsWith('_desc') ? bValKRW - aValKRW : aValKRW - bValKRW
      case 'pnl_desc':
      case 'pnl_asc': {
        const aPnl = Number.isFinite(a.unrealized_pnl) && (a.currency !== 'USD' || rate > 0) ? a.currency === 'USD' ? a.unrealized_pnl * rate : a.unrealized_pnl : null
        const bPnl = Number.isFinite(b.unrealized_pnl) && (b.currency !== 'USD' || rate > 0) ? b.currency === 'USD' ? b.unrealized_pnl * rate : b.unrealized_pnl : null
        if (!Number.isFinite(aPnl) || !Number.isFinite(bPnl)) return Number(Number.isFinite(bPnl)) - Number(Number.isFinite(aPnl))
        return sortBy === 'pnl_desc' ? bPnl - aPnl : aPnl - bPnl
      }
      default: return 0
    }
    })
  }, [holdings, filterMarket, filterSector, sortBy, account?.exchange_rate, i18n.language])

  const totalByMarket = useMemo(() => holdings.reduce((acc, h) => {
    const key = h.market
    if (!acc[key]) acc[key] = { value: 0, pnl: 0 }
    acc[key].value = Number.isFinite(h.total_value) && acc[key].value !== null ? acc[key].value + h.total_value : null
    acc[key].pnl += h.unrealized_pnl
    return acc
  }, {}), [holdings])

  // Stock-only total (KRW-converted), used as the single weight% denominator
  // everywhere so the holdings list always sums to ~100% regardless of cash.
  const totalHoldingsValueKRW = useMemo(() => {
    const rate = account?.exchange_rate
    return holdings.reduce(
      (sum, h) => {
        const value = h.currency === 'USD' ? h.total_value * rate : h.total_value
        return sum !== null && Number.isFinite(h.total_value) && Number.isFinite(value) ? sum + value : null
      },
      0
    )
  }, [holdings, account?.exchange_rate])

  const totalBySector = useMemo(() => holdings.reduce((acc, h) => {
    const sectorKey = h.sector
    if (!sectorKey) return acc
    if (!acc[sectorKey]) acc[sectorKey] = { count: 0 }
    acc[sectorKey].count++
    return acc
  }, {}), [holdings])

  if (loading) return <p>{t('common.loading')}</p>
  if (accountQuery.isError || holdingsQuery.isError || !account) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>
        {accountQuery.error?.message || holdingsQuery.error?.message || t('common.loadError')}
      </p>
      <button className="btn btn-primary" onClick={fetchData}>{t('common.retry')}</button>
    </div>
  )
  return (
    <div>
      <div className="page-header portfolio-page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">{t('portfolio.eyebrow')}</div>
          <h1 className="page-title">{t('portfolio.title')}</h1>
          <p className="page-subtitle">{t('portfolio.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate(gamePath(sessionId, 'search'))}>
            {tradeDisabledReason ? t('stock.reviewAction') : t('portfolio.tradeAction')}
          </button>
          <button type="button" className="btn" onClick={() => navigate(gamePath(sessionId, 'analytics'))}>
            {t('portfolio.analysisAction')}
          </button>
        </div>
      </div>

      {tradeDisabledReason && <p className="page-subtitle">{t('game.endedReviewNote')}</p>}
      {account.valuation_available === false && <p role="status">{t('common.valuationUnavailable')}</p>}

      {(() => {
        const rate = account?.exchange_rate
        const krxData = totalByMarket['KRX'] || { value: 0 }
        const usData = totalByMarket['US'] || { value: 0 }
        // KRW -> display currency, delegating to the shared formatMoney helper for
        // consistent symbol/grouping. Same asset-hero + 4-way breakdown as Dashboard.
        const fmtDual = (valueKRW) => !Number.isFinite(valueKRW) || (displayCurrency === 'USD' && !(rate > 0))
          ? t('common.unavailable')
          : displayCurrency === 'KRW'
          ? formatMoney(valueKRW, 'KRW')
          : formatMoney(valueKRW / rate, 'USD')
        const dayUp = account.daily_change_pct >= 0

        return (
          <section className="asset-hero">
            <div className="asset-hero-top">
              <div className="metric-label" style={{ marginBottom: 0 }}>{t('dashboard.totalValue')}</div>
              <div style={{ display: 'flex', gap: 2 }}>
                {['KRW', 'USD'].map(c => (
                  <button key={c} aria-pressed={displayCurrency === c} className={`btn segmented-button ${displayCurrency === c ? 'segmented-button-selected' : ''}`} onClick={() => setDisplayCurrency(c)} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6, lineHeight: '16px',
                  }}>{c === 'KRW' ? '₩' : '$'}</button>
                ))}
              </div>
            </div>
            <div className="asset-total">{fmtDual(account.total_value_krw)}</div>
            <div className={`asset-chip ${Number.isFinite(account.daily_change_pct) ? dayUp ? 'up' : 'down' : ''}`}>
              <span>{Number.isFinite(account.daily_change_krw) ? `${dayUp ? '+' : '-'}${fmtDual(Math.abs(account.daily_change_krw))}` : t('common.unavailable')}</span>
              <span className="asset-chip-sep" aria-hidden="true" />
              <span title={account.daily_change_reference_date || undefined}>{Number.isFinite(account.daily_change_pct) ? `${dayUp ? '+' : ''}${account.daily_change_pct}%` : t('common.unavailable')} {t(account.daily_change_basis === 'previous_snapshot' ? 'dashboard.sinceSnapshot' : account.daily_change_basis === 'starting_value' ? 'dashboard.sinceStart' : 'dashboard.today')}</span>
            </div>
            <div className="asset-break">
              <div><div className="k">{t('dashboard.koreanStocks')}</div><div className="v">{fmtDual(krxData.value)}</div></div>
              <div><div className="k">{t('dashboard.usStocks')}</div><div className="v">{fmtDual(usData.value === null ? null : usData.value * rate)}</div></div>
              <div><div className="k">{t('dashboard.cashKRW')}</div><div className="v">{fmtDual(account.balance_krw)}</div></div>
              <div><div className="k">{t('dashboard.cashUSD')}</div><div className="v">{fmtDual((account.balance_usd ?? 0) * rate)}</div></div>
            </div>
          </section>
        )
      })()}

      {holdings.length === 0 ? (
        <div className="empty-state">
          <h2>{t('portfolio.emptyTitle')}</h2>
          <p>{tradeDisabledReason || t('portfolio.emptyBody')}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate(tradeDisabledReason ? '/games/new' : gamePath(sessionId, 'search'))}>{tradeDisabledReason ? t('game.playAgain') : t('portfolio.emptyAction')}</button>
        </div>
      ) : <>
      <div className="card">
        <div className="card-title">{t('stock.sector')}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(totalBySector).map(([sector, data]) => (
            <button
              key={sector}
              type="button"
              className="interactive-card-button"
              aria-pressed={filterSector === sector}
              style={{
              background: 'var(--bg-secondary)', borderRadius: 10, padding: '8px 14px',
              fontSize: 13, cursor: 'pointer',
              border: filterSector === sector ? '2px solid var(--accent)' : '2px solid transparent',
            }}
              onClick={() => setFilterSector(filterSector === sector ? 'ALL' : sector)}
            >
              <div style={{ fontWeight: 600 }}>{sector}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{t('portfolio.stocksCount', { count: data.count })}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <MarketFilter value={filterMarket} onChange={e => setFilterMarket(e.target.value)} style={{ minWidth: 100 }} />
        <SortSelect value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: 120 }} />
      </div>

      <div className="card">
        {sorted.map(h => {
          const fmt = v => Number.isFinite(v) ? formatMoney(v, h.currency) : t('common.unavailable')
          const pnlPct = Number.isFinite(h.current_price) && h.avg_price > 0 ? `${((h.current_price - h.avg_price) / h.avg_price * 100).toFixed(2)}%` : t('common.unavailable')
          const name = getStockName(h.ticker, h.name, i18n.language)
          const isPositive = h.unrealized_pnl >= 0

          // Calculate Portfolio Weight (Allocation %) against stock-only total
          // (never cash) so the holdings list always sums to ~100%.
          const hValKRW = h.currency === 'USD' ? h.total_value * account?.exchange_rate : h.total_value
          const allocPct = Number.isFinite(h.total_value) && totalHoldingsValueKRW > 0 ? `${((hValKRW / totalHoldingsValueKRW) * 100).toFixed(1)}%` : t('common.unavailable')

          return (
            <button
              key={h.ticker}
              type="button"
              className="interactive-row portfolio-holding-row"
              onClick={() => setTradeTicker(h.ticker)}
              aria-label={`${name}, ${t('holdings.shares', { count: h.quantity })}, ${fmt(h.current_price)}, ${fmt(h.unrealized_pnl)} (${pnlPct}). ${t(tradeDisabledReason ? 'stock.viewDetails' : 'stock.openTrade')}`}
              style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 0', borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 15 }}>{name}</strong>
                <div className="row-meta" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct} {t('holdings.ofPortfolio')}</span> · {h.ticker}{h.sector && <> · {h.sector}</>}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div className="row-meta" style={{ fontSize: 13, width: '100%' }}>{t('holdings.shares', { count: h.quantity })}</div>
              </div>

              <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(h.current_price)}</div>
                <div className={`row-meta portfolio-holding-pnl ${Number.isFinite(h.unrealized_pnl) ? isPositive ? 'positive' : 'negative' : ''}`} style={{ fontSize: 13 }}>
                  {isPositive && Number.isFinite(h.unrealized_pnl) ? '+' : ''}{fmt(h.unrealized_pnl)} ({pnlPct})
                </div>
                <div className="row-meta" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{t('holdings.avgPrice')} {fmt(h.avg_price)}</div>
              </div>
            </button>
          )
        })}
      </div>
      </>}

      {tradeTicker && (
        <TradeModal ticker={tradeTicker}
          sessionId={sessionId}
          tradeDisabledReason={tradeDisabledReason}
          onClose={() => setTradeTicker(null)}
          onComplete={() => setTradeTicker(null)} />
      )}
    </div>
  )
}

export default Portfolio
