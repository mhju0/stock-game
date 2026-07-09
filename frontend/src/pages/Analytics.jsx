import { apiGet } from '../api'
import { useState, useEffect, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getStockName } from '../utils/stockNames'
import { formatMoney, formatDateTime } from '../utils/formatters'
import SortSelect from '../components/SortSelect'
import TradeModal from '../components/TradeModal'
import { UserContext } from '../context/userContext'
import { useAnalyticsPerformanceQuery, useAccountQuery } from '../query/queries'
import { gamePath, isSessionEnded } from '../sessionRoutes'

const COLORS = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ff2d55', '#ffcc00']

function Analytics() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const { session } = useOutletContext() || {}
  const { currentUserId } = useContext(UserContext)
  const tradeDisabledReason = isSessionEnded(session) ? t('game.tradeUnavailableEnded') : ''
  
  const [byStock, setByStock] = useState([])
  const [bySector, setBySector] = useState([])
  const [realized, setRealized] = useState(null)
  const [timeRange, setTimeRange] = useState('ALL')
  const [stockView, setStockView] = useState('list')
  const [stockSort, setStockSort] = useState('alloc_desc')
  const [tradeTicker, setTradeTicker] = useState(null)
  const [displayCurrency, setDisplayCurrency] = useState('KRW')

  const { data: accountData } = useAccountQuery(currentUserId, sessionId)
  const exchangeRate = accountData?.exchange_rate || 1350

  const {
    data: performance,
    isLoading: perfLoading,
    isError: perfError,
    refetch: refetchPerformance,
  } = useAnalyticsPerformanceQuery(currentUserId, sessionId)

  useEffect(() => {
    apiGet(`/game/sessions/${sessionId}/analytics/by-stock`, setByStock)
    apiGet(`/game/sessions/${sessionId}/analytics/by-sector`, setBySector)
    apiGet(`/game/sessions/${sessionId}/analytics/realized`, setRealized)
  }, [currentUserId, sessionId])

  const startVal = performance?.starting_value || 0
  const snapshots = useMemo(() => performance?.snapshots || [], [performance?.snapshots])
  const filtered = useMemo(() => {
    if (timeRange === 'ALL') return snapshots
    const cutoff = new Date()
    if (timeRange === '1W') cutoff.setDate(cutoff.getDate() - 7)
    if (timeRange === '1M') cutoff.setMonth(cutoff.getMonth() - 1)
    if (timeRange === '3M') cutoff.setMonth(cutoff.getMonth() - 3)
    return snapshots.filter(s => new Date(s.date) >= cutoff)
  }, [snapshots, timeRange])
  const chartDataReturn = useMemo(() => filtered.map(s => ({
    date: formatDateTime(s.date, i18n.language === 'ko' ? 'ko-KR' : 'en-US'),
    total_pct: startVal ? ((s.value - startVal) / startVal) * 100 : 0,
    total_value: s.value,
    absolute_change: s.value - startVal,
  })), [filtered, startVal, i18n.language])
  const chartDataAllocation = useMemo(() => filtered.map(s => {
    const v = s.value || 1
    const hv = s.holdings_value ?? 0
    return {
      date: formatDateTime(s.date, i18n.language === 'ko' ? 'ko-KR' : 'en-US'),
      stocks_pct: (hv / v) * 100,
      cash_pct: Math.max(0, ((v - hv) / v) * 100),
    }
  }), [filtered, i18n.language])

  const formatKRW = (v) => formatMoney(v, 'KRW')
  const fmtDisplay = (v) => displayCurrency === 'KRW' ? formatMoney(v, 'KRW') : `$${(v / exchangeRate).toFixed(2)}`
  const returnDomain = useMemo(() => {
    const returnValues = chartDataReturn.map(p => p.total_pct)
    const returnMin = returnValues.length ? Math.min(...returnValues) : 0
    const returnMax = returnValues.length ? Math.max(...returnValues) : 0
    // Ensure minimum ±10% range so small changes don't look extreme
    const domainMin = Math.min(returnMin, -10)
    const domainMax = Math.max(returnMax, 10)
    const span = Math.abs(domainMax - domainMin)
    const padding = Math.max(1, span * 0.1)
    return [domainMin - padding, domainMax + padding]
  }, [chartDataReturn])

  const sortedStocks = useMemo(() => [...byStock].sort((a, b) => {
    switch (stockSort) {
      case 'name_asc': return getStockName(a.ticker, a.name, i18n.language).localeCompare(getStockName(b.ticker, b.name, i18n.language))
      case 'name_desc': return getStockName(b.ticker, b.name, i18n.language).localeCompare(getStockName(a.ticker, a.name, i18n.language))
      case 'alloc_desc':
      case 'value_desc': return b.total_value_krw - a.total_value_krw
      case 'alloc_asc':
      case 'value_asc': return a.total_value_krw - b.total_value_krw
      case 'pnl_desc': return b.unrealized_pnl_pct - a.unrealized_pnl_pct
      case 'pnl_asc': return a.unrealized_pnl_pct - b.unrealized_pnl_pct
      case 'mcap_desc': return (b.market_cap || 0) - (a.market_cap || 0)
      case 'mcap_asc': return (a.market_cap || 0) - (b.market_cap || 0)
      default: return 0
    }
  }), [byStock, stockSort, i18n.language])

  const topStock = byStock.reduce((top, stockItem) => {
    if (!top || stockItem.total_value_krw > top.total_value_krw) return stockItem
    return top
  }, null)
  const topStockName = topStock ? getStockName(topStock.ticker, topStock.name, i18n.language) : ''
  const topAllocationPct = performance?.current_value
    ? ((topStock?.total_value_krw || 0) / performance.current_value) * 100
    : 0
  const latestAllocation = chartDataAllocation[chartDataAllocation.length - 1]
  const cashPct = latestAllocation ? latestAllocation.cash_pct : (byStock.length === 0 ? 100 : 0)
  const totalReturnPct = Number(performance?.total_return_pct || 0)
  const analyticsInsights = [
    {
      title: t('analytics.returnInsightTitle'),
      value: `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct}%`,
      body: totalReturnPct > 0
        ? t('analytics.returnInsightPositive')
        : totalReturnPct < 0
          ? t('analytics.returnInsightNegative')
          : t('analytics.returnInsightFlat'),
    },
    {
      title: t('analytics.concentrationTitle'),
      value: topStock ? `${topStockName} ${topAllocationPct.toFixed(0)}%` : '-',
      body: !topStock
        ? t('analytics.concentrationEmpty')
        : topAllocationPct >= 40
          ? t('analytics.concentrationHigh')
          : t('analytics.concentrationBalanced'),
    },
    {
      title: t('analytics.cashInsightTitle'),
      value: `${cashPct.toFixed(0)}%`,
      body: cashPct >= 40
        ? t('analytics.cashHigh')
        : cashPct <= 10
          ? t('analytics.cashLow')
          : t('analytics.cashBalanced'),
    },
    {
      title: t('analytics.activityInsightTitle'),
      value: t('portfolio.stocksCount', { count: byStock.length }),
      body: snapshots.length < 2 || byStock.length === 0
        ? t('analytics.activityLow')
        : t('analytics.activityActive'),
    },
  ]
  const analyticsSummaryBody = byStock.length === 0
    ? t('analytics.summaryNoData')
    : snapshots.length < 2
      ? t('analytics.summaryLimited')
      : topAllocationPct >= 40
        ? t('analytics.summaryConcentrated')
        : t('analytics.summaryBalanced')
  const analyticsNextActions = [
    { label: t('nav.portfolio'), to: gamePath(sessionId, 'portfolio'), primary: byStock.length > 0 },
    { label: t('nav.search'), to: gamePath(sessionId, 'search'), primary: byStock.length === 0 },
    { label: t('nav.transactions'), to: gamePath(sessionId, 'transactions') },
    { label: t('nav.watchlist'), to: '/watchlist' },
  ]

  if (perfLoading) return <p>{t('common.loading')}</p>
  if (
    perfError ||
    !performance ||
    performance.starting_value === undefined ||
    !Array.isArray(performance.snapshots)
  ) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>{t('analytics.retryBody')}</p>
      <button type="button" className="btn btn-primary" onClick={() => refetchPerformance()}>
        {t('common.retry')}
      </button>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('analytics.title')}</h1>
          <p className="page-subtitle">{t('analytics.subtitle')}</p>
        </div>
      </div>

      <div className="summary-card">
        <div className="summary-title">{t('analytics.summaryTitle')}</div>
        <p className="summary-body" style={{ marginBottom: 12 }}>{analyticsSummaryBody}</p>
        <p className="summary-body" style={{ marginBottom: 14 }}>{t('analytics.simulationNote')}</p>
        <div className="summary-title" style={{ fontSize: 14 }}>{t('analytics.nextChecksTitle')}</div>
        <div className="cta-row">
          {analyticsNextActions.map((action) => (
            <button
              key={action.to}
              type="button"
              className={action.primary ? 'btn btn-primary' : 'btn'}
              onClick={() => navigate(action.to)}
            >
              {action.label}
            </button>
          ))}
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
          <div className="metric-value">{fmtDisplay(performance.current_value)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t("analytics.totalReturn")}</div>
          <div className={`metric-value ${performance.total_return >= 0 ? 'positive' : 'negative'}`}>
            {performance.total_return >= 0 ? '+' : ''}{fmtDisplay(performance.total_return)}
          </div>
          <div className={performance.total_return_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
            {performance.total_return_pct >= 0 ? '+' : ''}{performance.total_return_pct}%
          </div>
        </div>
        {realized && (
          <div className="metric-card">
            <div className="metric-label">{t("analytics.realizedPnl")}</div>
            <div className={`metric-value ${realized.total_realized_pnl >= 0 ? 'positive' : 'negative'}`}>
              {realized.total_realized_pnl >= 0 ? '+' : ''}{fmtDisplay(realized.total_realized_pnl)}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">{t('analytics.insightsTitle')}</div>
        <div className="insight-grid" style={{ marginBottom: 0 }}>
          {analyticsInsights.map((insight) => (
            <div key={insight.title} className="insight-card">
              <div className="insight-label">{insight.title}</div>
              <div className="insight-value">{insight.value}</div>
              <div className="insight-body">{insight.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('analytics.portfolioOverTime')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['1W', '1M', '3M', 'ALL'].map(range => (
              <button key={range} className={`btn segmented-button ${timeRange === range ? 'segmented-button-selected' : ''}`} onClick={() => setTimeRange(range)} style={{
                fontSize: 12, padding: '4px 10px',
              }}>{range}</button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t('analytics.returnOverTime')}</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{t('analytics.totalChangePct')}</span>
          </div>
        </div>

        {chartDataReturn.length < 2 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>{t('analytics.chartEmpty')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartDataReturn}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
                domain={returnDomain}
                tickFormatter={v => `${v.toFixed(1)}%`} />
              <Tooltip
                formatter={(value, _name, item) => {
                  const payload = item?.payload || {}
                  return [
                    `${Number(value).toFixed(2)}% (${payload.absolute_change >= 0 ? '+' : ''}${formatKRW(payload.absolute_change || 0)})`,
                    t('analytics.totalChangePct'),
                  ]
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload
                  if (!p) return ''
                  return `${p.date} · ${t('dashboard.totalValue')}: ${formatKRW(p.total_value || 0)}`
                }}
                labelStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--card-bg)' }}
              />
              <Line type="linear" dataKey="total_pct" stroke="#007aff" strokeWidth={2} dot={false} name="total_pct" />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div style={{ borderTop: '1px solid var(--border-light)', margin: '24px 0' }} />

        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{t('analytics.allocationOverTime')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{t('analytics.allocationOverTimeHint')}</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 2, background: '#34c759', borderRadius: 1 }} />
            <span style={{ color: 'var(--text-secondary)' }}>{t('analytics.stocksShare')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 2, background: '#8e8e93', borderRadius: 1, borderTop: '1px dashed #8e8e93' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{t('analytics.cashShare')}</span>
          </div>
        </div>

        {chartDataAllocation.length < 2 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>{t('analytics.chartEmpty')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartDataAllocation}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip
                formatter={(value, name) => {
                  const label = name === 'stocks_pct' ? t('analytics.stocksShare') : t('analytics.cashShare')
                  return [`${Number(value).toFixed(1)}%`, label]
                }}
                labelStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--card-bg)' }}
              />
              <Line type="monotone" dataKey="stocks_pct" stroke="#34c759" strokeWidth={2} dot={false} name="stocks_pct" />
              <Line type="monotone" dataKey="cash_pct" stroke="#8e8e93" strokeWidth={1.5} dot={false}
                strokeDasharray="4 4" name="cash_pct" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {byStock.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>{t('analytics.byStock')} ({byStock.length})</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`btn segmented-button ${stockView === 'grid' ? 'segmented-button-selected' : ''}`} onClick={() => setStockView('grid')} style={{
                fontSize: 12, padding: '4px 10px',
              }}>{t('analytics.grid')}</button>
              <button className={`btn segmented-button ${stockView === 'list' ? 'segmented-button-selected' : ''}`} onClick={() => setStockView('list')} style={{
                fontSize: 12, padding: '4px 10px',
              }}>{t('analytics.list')}</button>
              
              <SortSelect value={stockSort} onChange={e => setStockSort(e.target.value)} />
            </div>
          </div>

          {stockView === 'grid' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 10,
            }}>
              {sortedStocks.map(s => {
                const fmt = v => s.currency === 'KRW' ? `₩${Math.round(Number(v) || 0).toLocaleString()}` : `$${(Number(v) || 0).toFixed(2)}`
                const isPositive = s.unrealized_pnl >= 0
                const name = getStockName(s.ticker, s.name, i18n.language)
                const allocPct = ((s.total_value_krw / (performance.current_value || 1)) * 100).toFixed(1)
                
                return (
                  <button
                    key={s.ticker}
                    type="button"
                    className="interactive-card-button"
                    onClick={() => setTradeTicker(s.ticker)}
                    aria-label={`${name} ${t('stock.openTrade')}`}
                    style={{
                    background: 'var(--bg-secondary)', borderRadius: 14, padding: 16,
                    cursor: 'pointer', transition: 'transform 0.1s',
                    borderLeft: `4px solid ${isPositive ? 'var(--positive)' : 'var(--negative)'}`,
                  }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                           <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}%</span> · {s.ticker}
                        </div>
                      </div>
                      <div className={isPositive ? 'positive' : 'negative'}
                        style={{ fontSize: 16, fontWeight: 700 }}>
                        {isPositive ? '+' : ''}{s.unrealized_pnl_pct}%
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>{s.quantity} {t('holdings.shares')}</span>
                      <span>{fmt(s.current_price)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{t('holdings.avgPrice')} {fmt(s.avg_price)}</span>
                      <span className={isPositive ? 'positive' : 'negative'}>
                        {isPositive ? '+' : ''}{fmt(s.unrealized_pnl)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{s.sector && <>{s.sector} · </>}{s.market}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div>
              {sortedStocks.map(s => {
                const fmt = v => s.currency === 'KRW' ? `₩${Math.round(Number(v) || 0).toLocaleString()}` : `$${(Number(v) || 0).toFixed(2)}`
                const isPositive = s.unrealized_pnl >= 0
                const name = getStockName(s.ticker, s.name, i18n.language)
                const allocPct = ((s.total_value_krw / (performance.current_value || 1)) * 100).toFixed(1)

                return (
                  <button
                    key={s.ticker}
                    type="button"
                    className="interactive-row"
                    onClick={() => setTradeTicker(s.ticker)}
                    aria-label={`${name} ${t('stock.openTrade')}`}
                    style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 0', borderBottom: '1px solid var(--border-light)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: 3,
                          background: isPositive ? 'var(--positive)' : 'var(--negative)', flexShrink: 0,
                        }} />
                        <strong style={{ fontSize: 14 }}>{name}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 14 }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}% {t('holdings.ofPortfolio')}</span> · {s.ticker}{s.sector && <> · {s.sector}</>} · {s.quantity} {t('holdings.shares')}
                      </div>
                    </div>
                    

                    
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(s.current_price)}</div>
                      <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                        {isPositive ? '+' : ''}{s.unrealized_pnl_pct}% ({isPositive ? '+' : ''}{fmt(s.unrealized_pnl)})
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {bySector.length > 0 && (
        <div className="card">
          <div className="card-title">{t('analytics.bySector')}</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={bySector}
                dataKey="allocation_pct"
                nameKey="sector"
                cx="50%"
                cy="50%"
                outerRadius={100}
              >
                {bySector.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--card-bg)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {bySector.map((s, i) => (
              <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                <span>{s.sector}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{s.allocation_pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tradeTicker && (
        <TradeModal ticker={tradeTicker}
          sessionId={sessionId}
          tradeDisabledReason={tradeDisabledReason}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null) }} />
      )}
    </div>
  )
}

export default Analytics
