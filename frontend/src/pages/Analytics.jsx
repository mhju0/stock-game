import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getStockName } from '../utils/stockNames'
import TradeModal from '../components/TradeModal'

const API = 'http://127.0.0.1:8000'
const COLORS = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ff2d55', '#ffcc00']

function Analytics() {
  const { t } = useTranslation()
  const [performance, setPerformance] = useState(null)
  const [byStock, setByStock] = useState([])
  const [bySector, setBySector] = useState([])
  const [realized, setRealized] = useState(null)
  const [timeRange, setTimeRange] = useState('ALL')
  const [stockView, setStockView] = useState('grid')
  const [stockSort, setStockSort] = useState('pnl_desc')
  const [tradeTicker, setTradeTicker] = useState(null)

  useEffect(() => {
    fetch(`${API}/analytics/performance`).then(r => r.json()).then(setPerformance)
    fetch(`${API}/analytics/by-stock`).then(r => r.json()).then(setByStock)
    fetch(`${API}/analytics/by-sector`).then(r => r.json()).then(setBySector)
    fetch(`${API}/analytics/realized`).then(r => r.json()).then(setRealized)
  }, [])

  if (!performance) return <p>{t('common.loading')}</p>

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
      case 'pnl_desc': return b.unrealized_pnl_pct - a.unrealized_pnl_pct
      case 'pnl_asc': return a.unrealized_pnl_pct - b.unrealized_pnl_pct
      case 'value_desc': return b.total_value_krw - a.total_value_krw
      case 'name': return getStockName(a.ticker, a.name).localeCompare(getStockName(b.ticker, b.name))
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
            <div style={{ width: 16, height: 2, background: '#007aff', borderRadius: 1 }} />
            <span style={{ color: 'var(--text-secondary)' }}>Total change %</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 2, background: '#34c759', borderRadius: 1, borderTop: '1px dashed #34c759' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Holdings as % of starting</span>
          </div>
        </div>

        {chartData.length < 2 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>Make some trades to see your performance chart</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v.toFixed(1)}%`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'total_pct') return [`${value.toFixed(2)}%`, 'Total change']
                  return [`${value.toFixed(2)}%`, 'Holdings ratio']
                }}
                labelStyle={{ fontSize: 12, color: '#86868b' }}
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
                <option value="pnl_desc">Best P&L</option>
                <option value="pnl_asc">Worst P&L</option>
                <option value="value_desc">Value ↓</option>
                <option value="name">A → Z</option>
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
                const name = getStockName(s.ticker, s.name)
                return (
                  <div key={s.ticker} onClick={() => setTradeTicker(s.ticker)} style={{
                    background: 'var(--bg-secondary)', borderRadius: 14, padding: 16,
                    cursor: 'pointer', transition: 'transform 0.1s',
                    borderLeft: `4px solid ${isPositive ? '#34c759' : '#ff3b30'}`,
                  }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.ticker}</div>
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
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                      {s.sector} · {s.market}
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
                const name = getStockName(s.ticker, s.name)
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
                          background: isPositive ? '#34c759' : '#ff3b30', flexShrink: 0,
                        }} />
                        <strong style={{ fontSize: 14 }}>{name}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 14 }}>
                        {s.ticker} · {s.sector} · {s.quantity} shares · avg {fmt(s.avg_price)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
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

      {bySector.length > 0 && (
        <div className="card">
          <div className="card-title">Performance by Sector</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie data={bySector} dataKey="allocation_pct" nameKey="sector"
                  cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                  {bySector.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value}%`, 'Allocation']}
                  contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--card-bg)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, minWidth: 200 }}>
              {bySector.map((s, i) => (
                <div key={s.sector} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{s.sector}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.stock_count} stocks · {s.allocation_pct}%</div>
                    </div>
                  </div>
                  <div className={s.pnl_krw >= 0 ? 'positive' : 'negative'} style={{ fontSize: 13, fontWeight: 600 }}>
                    {s.pnl_pct >= 0 ? '+' : ''}{s.pnl_pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {realized && realized.best_trade && (
        <div className="card">
          <div className="card-title">Trade Stats</div>
          <div className="metric-grid">
            <div className="metric-card" style={{ background: 'rgba(52, 199, 89, 0.1)' }}>
              <div className="metric-label">Best Trade</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#34c759' }}>
                {getStockName(realized.best_trade.ticker, realized.best_trade.ticker)}
              </div>
              <div style={{ fontSize: 13, color: '#34c759' }}>+{formatKRW(realized.best_trade.pnl)}</div>
            </div>
            {realized.worst_trade && (
              <div className="metric-card" style={{ background: 'rgba(255, 59, 48, 0.1)' }}>
                <div className="metric-label">Worst Trade</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ff3b30' }}>
                  {getStockName(realized.worst_trade.ticker, realized.worst_trade.ticker)}
                </div>
                <div style={{ fontSize: 13, color: '#ff3b30' }}>{formatKRW(realized.worst_trade.pnl)}</div>
              </div>
            )}
            <div className="metric-card">
              <div className="metric-label">Total Trades</div>
              <div className="metric-value">{realized.total_trades}</div>
            </div>
          </div>
        </div>
      )}

      {tradeTicker && (
        <TradeModal ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null) }} />
      )}
    </div>
  )
}

export default Analytics