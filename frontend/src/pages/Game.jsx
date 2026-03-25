import { apiGet, apiFetch } from '../api'
import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getStockName } from '../utils/stockNames'
import { UserContext } from '../context/UserContext'

function Game() {
  const { t, i18n } = useTranslation()
  const { currentUserId, setCurrentUserId } = useContext(UserContext)
  
  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [benchmarkData, setBenchmarkData] = useState([])
  const [portfolioData, setPortfolioData] = useState([])
  const [benchmarkIndex, setBenchmarkIndex] = useState('SP500')
  const [showSummary, setShowSummary] = useState(false)

  const fetchData = () => {
    apiGet(`/game/status?user_id=${currentUserId}`, setStatus)
    apiGet(`/game/summary?user_id=${currentUserId}`, setSummary)
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
  const isKo = i18n.language === 'ko'

  if (!status) return <p>{t('common.loading')}</p>

  if (!status.active) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎮</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          {isKo ? '활성 게임이 없습니다' : 'No Active Game'}
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          {isKo ? '게임 목록에서 새 게임을 만들어보세요' : 'Create a new game from the game hub'}
        </p>
        <button className="btn btn-primary" onClick={() => setCurrentUserId(null)}>
          {isKo ? '게임 목록' : 'My Games'}
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
            {status.is_expired ? (isKo ? '게임 종료' : 'Game Over') : (isKo ? '현재 진행 상황' : 'Current Progress')}
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
            <div className="metric-label">{isKo ? '기간' : 'Duration'}</div>
            <div className="metric-value">{Math.round(summary.days_elapsed)}{isKo ? '일' : 'd'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>/ {summary.duration_days}{isKo ? '일' : 'd'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{isKo ? '총 거래' : 'Total Trades'}</div>
            <div className="metric-value">{summary.total_trades}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {isKo ? `매수 ${summary.total_buys} · 매도 ${summary.total_sells}` : `${summary.total_buys} buys · ${summary.total_sells} sells`}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{isKo ? '승률' : 'Win Rate'}</div>
            <div className="metric-value">{summary.win_rate}%</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{summary.winning_trades}W / {summary.losing_trades}L</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{isKo ? '실현 손익' : 'Realized P&L'}</div>
            <div className={`metric-value ${summary.realized_pnl >= 0 ? 'positive' : 'negative'}`}>
              {summary.realized_pnl >= 0 ? '+' : ''}{formatKRW(summary.realized_pnl)}
            </div>
          </div>
        </div>

        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-label">{isKo ? '최고 평가액' : 'Peak Value'}</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{formatKRW(summary.peak_value)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{isKo ? '최저 평가액' : 'Lowest Value'}</div>
            <div className="metric-value" style={{ fontSize: 18 }}>{formatKRW(summary.trough_value)}</div>
          </div>
        </div>

        {summary.best_trade && (
          <div className="metric-grid">
            <div className="metric-card" style={{ background: 'var(--positive-bg)' }}>
              <div className="metric-label">{isKo ? '최고 수익 거래' : 'Best Trade'}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--positive)' }}>
                {getStockName(summary.best_trade.ticker, summary.best_trade.name, i18n.language)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--positive)' }}>+{formatKRW(summary.best_trade.pnl)}</div>
            </div>
            {summary.worst_trade && (
              <div className="metric-card" style={{ background: 'var(--negative-bg)' }}>
                <div className="metric-label">{isKo ? '최저 수익 거래' : 'Worst Trade'}</div>
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
            onClick={() => setShowSummary(false)}>{isKo ? '돌아가기' : 'Back'}</button>
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={() => setCurrentUserId(null)}>{isKo ? '게임 목록' : 'My Games'}</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Game Status */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">{isKo ? '시작 자금' : 'Starting Balance'}</div>
          <div className="metric-value">{formatKRW(status.starting_balance_krw)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{isKo ? '현재 평가액' : 'Current Value'}</div>
          <div className="metric-value">{formatKRW(status.current_value_krw)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{isKo ? '수익률' : 'Return'}</div>
          <div className={`metric-value ${status.current_return_pct >= 0 ? 'positive' : 'negative'}`}>
            {status.current_return_pct >= 0 ? '+' : ''}{status.current_return_pct}%
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{isKo ? '남은 기간' : 'Days Left'}</div>
          <div className="metric-value">{status.is_expired ? (isKo ? '종료' : 'Done') : `${Math.round(status.days_remaining)}${isKo ? '일' : 'd'}`}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{Math.round(status.days_elapsed)}{isKo ? '일' : 'd'} / {status.duration_days}{isKo ? '일' : 'd'}</div>
        </div>
      </div>

      <div className={`game-status-bar ${status.is_expired ? 'game-expired' : 'game-active'}`}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {status.is_expired ? (isKo ? '게임 종료' : 'Game Over') : (isKo ? '게임 진행 중' : 'Game Active')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {new Date(status.start_date).toLocaleDateString('ko-KR')} → {new Date(status.end_date).toLocaleDateString('ko-KR')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => setShowSummary(true)}>{isKo ? '요약' : 'Summary'}</button>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => setCurrentUserId(null)}>{isKo ? '게임 목록' : 'My Games'}</button>
        </div>
      </div>

      {/* Benchmark Chart */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{isKo ? '내 포트폴리오 vs 벤치마크' : 'My Portfolio vs Benchmark'}</div>
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
          <div className="empty-state" style={{ padding: '24px 0' }}>
            {isKo ? '거래를 하면 수익률을 비교할 수 있어요' : 'Make some trades to compare your performance'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mergeChartData()}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false}
                tickFormatter={v => `${new Date(v).getMonth() + 1}/${new Date(v).getDate()}`} />
              <YAxis tick={{ fontSize: 11, fill: '#86868b' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(value, name) => [`${value?.toFixed(2)}%`, name]}
                labelStyle={{ fontSize: 12 }} contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13 }} />
              <Legend />
              <Line type="monotone" dataKey="portfolio" stroke="#007aff" strokeWidth={2} dot={false} name={isKo ? '내 포트폴리오' : 'My Portfolio'} connectNulls />
              <Line type="monotone" dataKey="benchmark" stroke="#86868b" strokeWidth={1.5} dot={false} strokeDasharray="4 4"
                name={benchmarkIndex === 'SP500' ? 'S&P 500' : 'KOSPI'} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default Game
