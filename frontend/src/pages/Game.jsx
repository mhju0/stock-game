import { apiFetch } from '../api'
import { useState, useEffect, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getStockName } from '../utils/stockNames'
import { UserContext } from '../context/UserContext'
import { formatMoney } from '../utils/formatters'

function Game() {
  const { t, i18n } = useTranslation()
  const { currentUserId, setCurrentUserId } = useContext(UserContext)
  
  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [benchmarkData, setBenchmarkData] = useState([])
  const [portfolioData, setPortfolioData] = useState([])
  const [benchmarkIndex, setBenchmarkIndex] = useState('SP500')
  const [showSummary, setShowSummary] = useState(false)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      apiFetch(`/game/status?user_id=${currentUserId}`).then(d => { if (d) setStatus(d) }),
      apiFetch(`/game/summary?user_id=${currentUserId}`).then(d => { if (d) setSummary(d) }),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [currentUserId])

  useEffect(() => {
    if (!status?.active) return
    const days = status.duration_days

    apiFetch(`/game/benchmark/${benchmarkIndex}?days=${days}`)
      .then(data => { if (Array.isArray(data)) setBenchmarkData(data) })

    apiFetch(`/analytics/performance?user_id=${currentUserId}`)
      .then(data => {
        if (data?.snapshots) {
          const startVal = data.starting_value
          setPortfolioData(data.snapshots.map(s => ({
            date: s.date.split('T')[0],
            change_pct: ((s.value - startVal) / startVal) * 100,
            value: s.value,
          })))
        }
      })
  }, [status?.active, benchmarkIndex, currentUserId])

  const mergedChartData = useMemo(() => {
    const map = {}
    benchmarkData.forEach(b => { map[b.date] = { date: b.date, benchmark: b.change_pct } })
    portfolioData.forEach(p => {
      const date = p.date
      if (map[date]) map[date].portfolio = p.change_pct
      else map[date] = { date, portfolio: p.change_pct }
    })
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
  }, [benchmarkData, portfolioData])

  const formatKRW = (v) => formatMoney(v, 'KRW')
  const isKo = i18n.language === 'ko'

  if (loading) return <p>{t('common.loading')}</p>
  if (!status) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>Failed to load game data. Is the backend running?</p>
      <button className="btn btn-primary" onClick={fetchData}>Retry</button>
    </div>
  )

  if (!status.active) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎮</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          {t('game.noActive')}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          {t('game.noActiveDesc')}
        </p>
        <button className="btn btn-primary" onClick={() => setCurrentUserId(null)}>
          {t('nav.myGames')}
        </button>
      </div>
    )
  }

  // Summary view
  if (showSummary && summary?.active) {
    const isPositive = summary.total_return >= 0
    return (
      <div>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{isPositive ? '📈' : '📉'}</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            {status.is_expired ? (t('game.gameOver')) : (t('game.progress'))}
          </h2>
          <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 36, fontWeight: 700 }}>
            {isPositive ? '+' : ''}{summary.total_return_pct.toFixed(2)}%
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 4 }}>
            {formatKRW(summary.starting_balance)} → {formatKRW(summary.current_value)}
          </div>
          <div className={isPositive ? 'positive' : 'negative'} style={{ fontSize: 16, marginTop: 4 }}>
            {isPositive ? '+' : ''}{formatKRW(summary.total_return)}
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">{t('game.duration')}</div>
            <div className="metric-value">{Math.round(summary.days_elapsed)}{isKo ? '일' : 'd'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>/ {summary.duration_days}{isKo ? '일' : 'd'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{t('game.totalTrades')}</div>
            <div className="metric-value">{summary.total_trades}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {isKo ? `${t('transactions.buy')} ${summary.total_buys} · ${t('transactions.sell')} ${summary.total_sells}` : `${summary.total_buys} buys · ${summary.total_sells} sells`}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{t('analytics.winRate')}</div>
            <div className="metric-value">{summary.win_rate}%</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{summary.winning_trades}W / {summary.losing_trades}L</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{t('analytics.realizedPnl')}</div>
            <div className={`metric-value ${summary.realized_pnl >= 0 ? 'positive' : 'negative'}`}>
              {summary.realized_pnl >= 0 ? '+' : ''}{formatKRW(summary.realized_pnl)}
            </div>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">{t('game.peakValue')}</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{formatKRW(summary.peak_value)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{t('game.lowestValue')}</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{formatKRW(summary.trough_value)}</div>
          </div>
        </div>

        {summary.best_trade && (
          <div className="metric-grid">
            <div className="metric-card" style={{ background: 'var(--positive-bg)' }}>
              <div className="metric-label">{t('game.bestTrade')}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--positive)' }}>
                {getStockName(summary.best_trade.ticker, summary.best_trade.name, i18n.language)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--positive)' }}>+{formatKRW(summary.best_trade.pnl)}</div>
            </div>
            {summary.worst_trade && (
              <div className="metric-card" style={{ background: 'var(--negative-bg)' }}>
                <div className="metric-label">{t('game.worstTrade')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--negative)' }}>
                  {getStockName(summary.worst_trade.ticker, summary.worst_trade.name, i18n.language)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--negative)' }}>{formatKRW(summary.worst_trade.pnl)}</div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn" style={{ flex: 1, border: '1px solid var(--border)' }}
            onClick={() => setShowSummary(false)}>{t('common.back')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={() => setCurrentUserId(null)}>{t('nav.myGames')}</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Game Status */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">{t('game.startingBalance')}</div>
          <div className="metric-value">{formatKRW(status.starting_balance_krw)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('game.currentValue')}</div>
          <div className="metric-value">{formatKRW(status.current_value_krw)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('game.return')}</div>
          <div className={`metric-value ${status.current_return_pct >= 0 ? 'positive' : 'negative'}`}>
            {status.current_return_pct >= 0 ? '+' : ''}{status.current_return_pct}%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('game.daysLeft')}</div>
          <div className="metric-value">{status.is_expired ? (t('game.done')) : `${Math.round(status.days_remaining)}${isKo ? '일' : 'd'}`}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{Math.round(status.days_elapsed)}{isKo ? '일' : 'd'} / {status.duration_days}{isKo ? '일' : 'd'}</div>
        </div>
      </div>

      <div className={`game-status-bar ${status.is_expired ? 'game-expired' : 'game-active'}`}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {status.is_expired ? (t('game.gameOver')) : (t('game.gameActive'))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {new Date(status.start_date).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')} → {new Date(status.end_date).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => setShowSummary(true)}>{t('game.summary')}</button>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => setCurrentUserId(null)}>{t('nav.myGames')}</button>
        </div>
      </div>

      {/* Benchmark Chart */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('game.vsBenchmark')}</div>
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

        {mergedChartData.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('game.day1Title')}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{t('game.day1Desc')}</div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, textAlign: 'left', fontSize: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>1️⃣</span>
                <span>{isKo ? '종목 탭에서 관심 종목을 검색하세요' : 'Search for stocks in the Stocks tab'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>2️⃣</span>
                <span>{isKo ? '미국 주식이라면 먼저 환전하세요' : 'Exchange KRW to USD for US stocks'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>3️⃣</span>
                <span>{isKo ? '매수 후 여기서 벤치마크와 비교하세요' : 'Buy stocks and compare vs benchmarks here'}</span>
              </div>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mergedChartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${new Date(v).getMonth() + 1}/${new Date(v).getDate()}`} />
              <YAxis tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(value, name) => [`${value?.toFixed(2)}%`, name]}
                labelStyle={{ fontSize: 12 }} contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13 }} />
              <Legend />
              <Line type="monotone" dataKey="portfolio" stroke="#007aff" strokeWidth={2}
                dot={mergedChartData.length <= 2 ? { r: 5, fill: '#007aff', stroke: '#fff', strokeWidth: 2 } : false}
                name={t('game.myPortfolio')} connectNulls />
              <Line type="monotone" dataKey="benchmark" stroke="#86868b" strokeWidth={1.5}
                dot={mergedChartData.length <= 2 ? { r: 4, fill: '#86868b', stroke: '#fff', strokeWidth: 2 } : false}
                strokeDasharray="4 4"
                name={benchmarkIndex === 'SP500' ? 'S&P 500' : 'KOSPI'} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default Game
