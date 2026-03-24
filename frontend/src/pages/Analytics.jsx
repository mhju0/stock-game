import { apiGet } from '../api'
import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getStockName } from '../utils/stockNames'
import TradeModal from '../components/TradeModal'
import { UserContext } from '../context/UserContext'

const COLORS = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ff2d55', '#ffcc00']

function Analytics() {
  const { t, i18n } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [performance, setPerformance] = useState(null)
  const [byStock, setByStock] = useState([])
  const [bySector, setBySector] = useState([])
  const [realized, setRealized] = useState(null)
  const [timeRange, setTimeRange] = useState('ALL')
  const [stockView, setStockView] = useState('grid')
  const [stockSort, setStockSort] = useState('alloc_desc')
  const [tradeTicker, setTradeTicker] = useState(null)

  useEffect(() => {
    apiGet(`/analytics/performance?user_id=${currentUserId}`, setPerformance)
    apiGet(`/analytics/by-stock?user_id=${currentUserId}`, setByStock)
    apiGet(`/analytics/by-sector?user_id=${currentUserId}`, setBySector)
    apiGet(`/analytics/realized?user_id=${currentUserId}`, setRealized)
  }, [currentUserId])

  if (!performance) return <p>{t('common.loading')}</p>

  // Formatting helper for Market Cap
  const formatMcap = (val, currency) => {
    if (!val) return '-'
    const prefix = currency === 'KRW' ? '₩' : '$'
    if (val >= 1e12) return `${prefix}${(val / 1e12).toFixed(2)}T`
    if (val >= 1e9) return `${prefix}${(val / 1e9).toFixed(2)}B`
    if (val >= 1e6) return `${prefix}${(val / 1e6).toFixed(2)}M`
    return `${prefix}${val.toLocaleString()}`
  }

  const filterSnapshots = (snapshots) => {
    if (timeRange === 'ALL') return snapshots
    const cutoff = new Date()
    if (timeRange === '1W') cutoff.setDate(cutoff.getDate() - 7)
    if (timeRange === '1M') cutoff.setMonth(cutoff.getMonth() - 1)
    if (timeRange === '3M') cutoff.setMonth(cutoff.getMonth() - 3)
    return snapshots.filter(s => new Date(s.date) >= cutoff)
  }

  const startVal = performance.starting_value
  const chartData = filterSnapshots(performance.snapshots).map(s => ({
    date: new Date(s.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    total_pct: ((s.value - startVal) / startVal) * 100,
    holdings_pct: ((s.holdings_value - 0) / (startVal || 1)) * 100,
    total_value: s.value,
    holdings_value: s.holdings_value,
    cash: s.cash_krw,
  }))

  const formatKRW = (v) => `₩${Math.round(v).toLocaleString()}`

  const sortedStocks = [...byStock].sort((a, b) => {
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
  })

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.totalValue')}</div>
          <div className="metric-value">{formatKRW(performance.current_value)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Return</div>
          <div className={`metric-value ${performance.total_return >= 0 ? 'positive' : 'negative'}`}>
            {performance.total_return >= 0 ? '+' : ''}{formatKRW(performance.total_return)}
          </div>
          <div className={performance.total_return_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
            {performance.total_return_pct >= 0 ? '+' : ''}{performance.total_return_pct}%
          </div>
        </div>
        {realized && (
          <>
            <div className="metric-card">
              <div className="metric-label">Win Rate</div>
              <div className="metric-value">{realized.win_rate}%</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                {realized.winning_trades}W / {realized.losing_trades}L
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Realized P&L</div>
              <div className={`metric-value ${realized.total_realized_pnl >= 0 ? 'positive' : 'negative'}`}>
                {realized.total_realized_pnl >= 0 ? '+' : ''}{formatKRW(realized.total_realized_pnl)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Portfolio Value Over Time</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['1W', '1M', '3M', 'ALL'].map(range => (
              <button key={range} className="btn" onClick={() => setTimeRange(range)} style={{
                fontSize: 12, padding: '4px 10px',
                background: timeRange === range ? 'var(--text-primary)' : 'transparent',
                color: timeRange === range ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>{range}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 1 }} />
            <span style={{ color: 'var(--text-secondary)' }}>Total change %</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 2, background: 'var(--positive)', borderRadius: 1, borderTop: '1px dashed var(--positive)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Holdings as % of starting</span>
          </div>
        </div>

        {chartData.length < 2 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>Make some trades to see your performance chart</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v.toFixed(1)}%`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'total_pct') return [`${value.toFixed(2)}%`, 'Total change']
                  return [`${value.toFixed(2)}%`, 'Holdings ratio']
                }}
                labelStyle={{ fontSize: 12, color: 'var(--text-secondary)' }}
                contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--card-bg)' }}
              />
              <Line type="monotone" dataKey="total_pct" stroke="#007aff" strokeWidth={2} dot={false} name="total_pct" />
              <Line type="monotone" dataKey="holdings_pct" stroke="#34c759" strokeWidth={1.5} dot={false}
                strokeDasharray="4 4" name="holdings_pct" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {byStock.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Performance by Stock ({byStock.length})</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn" onClick={() => setStockView('grid')} style={{
                fontSize: 12, padding: '4px 10px',
                background: stockView === 'grid' ? 'var(--text-primary)' : 'transparent',
                color: stockView === 'grid' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>Grid</button>
              <button className="btn" onClick={() => setStockView('list')} style={{
                fontSize: 12, padding: '4px 10px',
                background: stockView === 'list' ? 'var(--text-primary)' : 'transparent',
                color: stockView === 'list' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>List</button>
              
              <select className="input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }}
                value={stockSort} onChange={e => setStockSort(e.target.value)}>
                <option value="alloc_desc">Allocation (High → Low)</option>
                <option value="alloc_asc">Allocation (Low → High)</option>
                <option value="mcap_desc">Market Cap (High → Low)</option>
                <option value="mcap_asc">Market Cap (Low → High)</option>
                <option value="name_asc">Name (A → Z)</option>
                <option value="name_desc">Name (Z → A)</option>
                <option value="value_desc">Value (High → Low)</option>
                <option value="value_asc">Value (Low → High)</option>
                <option value="pnl_desc">P&L (High → Low)</option>
                <option value="pnl_asc">P&L (Low → High)</option>
              </select>
            </div>
          </div>

          {stockView === 'grid' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 10,
            }}>
              {sortedStocks.map(s => {
                const fmt = v => s.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
                const isPositive = s.unrealized_pnl >= 0
                const name = getStockName(s.ticker, s.name, i18n.language)
                const allocPct = ((s.total_value_krw / performance.current_value) * 100).toFixed(1)
                
                return (
                  <div key={s.ticker} onClick={() => setTradeTicker(s.ticker)} style={{
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
                      <span>{s.quantity} shares</span>
                      <span>{fmt(s.current_price)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>avg {fmt(s.avg_price)}</span>
                      <span className={isPositive ? 'positive' : 'negative'}>
                        {isPositive ? '+' : ''}{fmt(s.unrealized_pnl)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{s.sector} · {s.market}</span>
                      <span>Cap: {formatMcap(s.market_cap, s.currency)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div>
              {sortedStocks.map(s => {
                const fmt = v => s.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
                const isPositive = s.unrealized_pnl >= 0
                const name = getStockName(s.ticker, s.name, i18n.language)
                const allocPct = ((s.total_value_krw / performance.current_value) * 100).toFixed(1)

                return (
                  <div key={s.ticker} onClick={() => setTradeTicker(s.ticker)} style={{
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
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{allocPct}% of Portfolio</span> · {s.ticker} · {s.sector} · {s.quantity} shares
                      </div>
                    </div>
                    
                    <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                        Cap: {formatMcap(s.market_cap, s.currency)}
                    </div>
                    
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{fmt(s.current_price)}</div>
                      <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                        {isPositive ? '+' : ''}{s.unrealized_pnl_pct}% ({isPositive ? '+' : ''}{fmt(s.unrealized_pnl)})
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ... Sector Breakdown code ... */}
      
      {tradeTicker && (
        <TradeModal ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null) }} />
      )}
    </div>
  )
}

export default Analytics