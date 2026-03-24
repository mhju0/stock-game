import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getStockName } from '../utils/stockNames'
import { UserContext } from '../context/UserContext'

const API = 'http://127.0.0.1:8000'

function Game() {
  const { t } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [summary, setSummary] = useState(null)
  const [benchmarkData, setBenchmarkData] = useState([])
  const [portfolioData, setPortfolioData] = useState([])
  const [benchmarkIndex, setBenchmarkIndex] = useState('SP500')
  const [showNewGame, setShowNewGame] = useState(false)
  const [startingBalance, setStartingBalance] = useState(10000000)
  const [duration, setDuration] = useState(90)
  const [confirmReset, setConfirmReset] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  const fetchData = () => {
    fetch(`${API}/game/status?user_id=${currentUserId}`).then(r => r.json()).then(setStatus)
    fetch(`${API}/game/history?user_id=${currentUserId}`).then(r => r.json()).then(setHistory)
    fetch(`${API}/game/summary?user_id=${currentUserId}`).then(r => r.json()).then(setSummary)
  }

  useEffect(() => { fetchData() }, [currentUserId])

  useEffect(() => {
    if (!status?.active) return
    const days = status.duration_days

    fetch(`${API}/game/benchmark/${benchmarkIndex}?days=${days}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setBenchmarkData(data) })

    fetch(`${API}/analytics/performance?user_id=${currentUserId}`)
      .then(r => r.json())
      .then(data => {
        if (data.snapshots) {
          const startVal = data.starting_value
          setPortfolioData(data.snapshots.map(s => ({
            date: s.date.split('T')[0],
            change_pct: ((s.value - startVal) / startVal) * 100,
            value: s.value,
          })))
        }
      })
  }, [status?.active, benchmarkIndex, currentUserId])

  const startNewGame = async () => {
    const res = await fetch(`${API}/game/new?user_id=${currentUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starting_balance_krw: startingBalance, duration_days: duration }),
    })
    if (res.ok) {
      setShowNewGame(false)
      setConfirmReset(false)
      setShowSummary(false)
      fetchData()
    }
  }

  const mergeChartData = () => {
    const map = {}
    benchmarkData.forEach(b => { map[b.date] = { date: b.date, benchmark: b.change_pct } })
    portfolioData.forEach(p => {
      const date = p.date
      if (map[date]) map[date].portfolio = p.change_pct
      else map[date] = { date, portfolio: p.change_pct }
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }

  const formatKRW = (v) => `₩${Math.round(v).toLocaleString()}`

  if (!status) return <p>{t('common.loading')}</p>

  if (showSummary && summary?.active) {
    const isPositive = summary.total_return >= 0
    return (
      <div>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{isPositive ? '📈' : '📉'}</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {status.is_expired ? 'Game Over' : 'Current Progress'}
          </h2>
          <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 36, fontWeight: 700 }}>
            {isPositive ? '+' : ''}{summary.total_return_pct.toFixed(2)}%
          </div>
          <div style={{ fontSize: 15, color: '#86868b', marginTop: 4 }}>
            {formatKRW(summary.starting_balance)} → {formatKRW(summary.current_value)}
          </div>
          <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 16, marginTop: 4 }}>
            {isPositive ? '+' : ''}{formatKRW(summary.total_return)}
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Duration</div>
            <div className="metric-value">{Math.round(summary.days_elapsed)}d</div>
            <div style={{ fontSize: 12, color: '#86868b' }}>of {summary.duration_days}d</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Trades</div>
            <div className="metric-value">{summary.total_trades}</div>
            <div style={{ fontSize: 12, color: '#86868b' }}>{summary.total_buys} buys · {summary.total_sells} sells</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Win Rate</div>
            <div className="metric-value">{summary.win_rate}%</div>
            <div style={{ fontSize: 12, color: '#86868b' }}>{summary.winning_trades}W / {summary.losing_trades}L</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Realized P&L</div>
            <div className={`metric-value ${summary.realized_pnl >= 0 ? 'positive' : 'negative'}`}>
              {summary.realized_pnl >= 0 ? '+' : ''}{formatKRW(summary.realized_pnl)}
            </div>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">Peak Value</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{formatKRW(summary.peak_value)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Lowest Value</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{formatKRW(summary.trough_value)}</div>
          </div>
        </div>

        {summary.best_trade && (
          <div className="metric-grid">
            <div className="metric-card" style={{ background: '#e8f8ed' }}>
              <div className="metric-label">Best Trade</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#34c759' }}>
                {getStockName(summary.best_trade.ticker, summary.best_trade.name)}
              </div>
              <div style={{ fontSize: 13, color: '#34c759' }}>+{formatKRW(summary.best_trade.pnl)}</div>
            </div>
            {summary.worst_trade && (
              <div className="metric-card" style={{ background: '#fde8e8' }}>
                <div className="metric-label">Worst Trade</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ff3b30' }}>
                  {getStockName(summary.worst_trade.ticker, summary.worst_trade.name)}
                </div>
                <div style={{ fontSize: 13, color: '#ff3b30' }}>{formatKRW(summary.worst_trade.pnl)}</div>
              </div>
            )}
          </div>
        )}

        {summary.most_traded && (
          <div className="card">
            <div className="card-title">Fun Facts</div>
            <div style={{ fontSize: 14 }}>Most traded stock: <strong>{summary.most_traded}</strong></div>
            <div style={{ fontSize: 14 }}>Current holdings: <strong>{summary.current_holdings_count}</strong> stocks</div>
            <div style={{ fontSize: 14 }}>Currency exchanges: <strong>{summary.total_exchanges}</strong></div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1, border: '1px solid var(--border)' }}
            onClick={() => setShowSummary(false)}>Back</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={() => { setShowSummary(false); setShowNewGame(true) }}>New Game</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {status.active && (
        <div>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Starting Balance</div>
              <div className="metric-value">{formatKRW(status.starting_balance_krw)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Current Value</div>
              <div className="metric-value">{formatKRW(status.current_value_krw)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Return</div>
              <div className={`metric-value ${status.current_return_pct >= 0 ? 'positive' : 'negative'}`}>
                {status.current_return_pct >= 0 ? '+' : ''}{status.current_return_pct}%
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Days Remaining</div>
              <div className="metric-value">{status.is_expired ? 'Finished' : `${Math.round(status.days_remaining)}d`}</div>
              <div style={{ fontSize: 12, color: '#86868b' }}>{Math.round(status.days_elapsed)}d / {status.duration_days}d</div>
            </div>
          </div>

          <div className={`game-status-bar ${status.is_expired ? 'game-expired' : 'game-active'}`}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{status.is_expired ? 'Game Over!' : 'Game Active'}</div>
              <div style={{ fontSize: 12, color: '#86868b' }}>
                {new Date(status.start_date).toLocaleDateString('ko-KR')} → {new Date(status.end_date).toLocaleDateString('ko-KR')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
                onClick={() => setShowSummary(true)}>Summary</button>
              {status.is_expired && (
                <button className="btn btn-primary" onClick={() => setShowNewGame(true)}>New Game</button>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 0 }}>My Portfolio vs Benchmark</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['SP500', 'KOSPI'].map(idx => (
                  <button key={idx} className="btn" onClick={() => setBenchmarkIndex(idx)} style={{
                    fontSize: 12, padding: '4px 10px',
                    background: benchmarkIndex === idx ? 'var(--text-primary)' : 'transparent',
                    color: benchmarkIndex === idx ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}>{idx === 'SP500' ? 'S&P 500' : 'KOSPI'}</button>
                ))}
              </div>
            </div>

            {mergeChartData().length < 2 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>Make some trades to compare your performance</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={mergeChartData()}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${new Date(v).getMonth() + 1}/${new Date(v).getDate()}`} />
                  <YAxis tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(value, name) => [`${value?.toFixed(2)}%`, name]}
                    labelStyle={{ fontSize: 12 }} contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e7', fontSize: 13 }} />
                  <Legend />
                  <Line type="monotone" dataKey="portfolio" stroke="#007aff" strokeWidth={2} dot={false} name="My Portfolio" connectNulls />
                  <Line type="monotone" dataKey="benchmark" stroke="#86868b" strokeWidth={1.5} dot={false} strokeDasharray="4 4"
                    name={benchmarkIndex === 'SP500' ? 'S&P 500' : 'KOSPI'} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {!status.active && !showNewGame && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            {history.length > 0 ? 'Start a New Challenge' : 'Welcome to Stock Game'}
          </h2>
          <p style={{ color: '#86868b', marginBottom: 24 }}>
            Set your starting balance and time limit, then try to beat the market.
          </p>
          <button className="btn btn-primary" onClick={() => setShowNewGame(true)}>Start New Game</button>
        </div>
      )}

      {showNewGame && (
        <div className="card">
          <div className="card-title">New Game Setup</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="setup-label">Starting Balance (KRW)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[5000000, 10000000, 50000000, 100000000].map(v => (
                  <button key={v} className="btn" onClick={() => setStartingBalance(v)} style={{
                    fontSize: 13, padding: '8px 14px',
                    background: startingBalance === v ? '#007aff' : 'transparent',
                    color: startingBalance === v ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}>₩{(v / 10000).toLocaleString()}만</button>
                ))}
              </div>
            </div>
            <div>
              <label className="setup-label">Duration</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[{ days: 7, label: '1 Week' }, { days: 30, label: '1 Month' }, { days: 90, label: '3 Months' }, { days: 180, label: '6 Months' }].map(v => (
                  <button key={v.days} className="btn" onClick={() => setDuration(v.days)} style={{
                    fontSize: 13, padding: '8px 14px',
                    background: duration === v.days ? '#007aff' : 'transparent',
                    color: duration === v.days ? 'white' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}>{v.label}</button>
                ))}
              </div>
            </div>
            <div className="setup-preview">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#86868b' }}>Starting Balance</span>
                <span style={{ fontWeight: 600 }}>{formatKRW(startingBalance)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#86868b' }}>Duration</span>
                <span style={{ fontWeight: 600 }}>{duration} days</span>
              </div>
            </div>
            {status.active && !confirmReset ? (
              <button className="btn btn-sell" onClick={() => setConfirmReset(true)}>
                This will reset your current game. Continue?
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={startNewGame}>Start Game</button>
                <button className="btn" style={{ border: '1px solid var(--border)' }}
                  onClick={() => { setShowNewGame(false); setConfirmReset(false) }}>{t('common.cancel')}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Past Games</div>
          {history.map(game => {
            const isPositive = (game.final_return_pct || 0) >= 0
            return (
              <div key={game.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{formatKRW(game.starting_balance_krw)} · {game.duration_days} days</div>
                  <div style={{ fontSize: 12, color: '#86868b' }}>
                    {new Date(game.start_date).toLocaleDateString('ko-KR')} → {new Date(game.end_date).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{game.final_value_krw ? formatKRW(game.final_value_krw) : '-'}</div>
                  <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 13 }}>
                    {isPositive ? '+' : ''}{game.final_return_pct?.toFixed(2) || 0}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Game