import { apiFetch } from '../api'
import { useCallback, useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getStockName } from '../utils/stockNames'
import { formatDateTime, formatMoney } from '../utils/formatters'
import { gamePath, sessionStatusLabelKey } from '../sessionRoutes'

function ResultMetric({ label, children, tone = '' }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone}`}>{children}</div>
    </div>
  )
}

function Game() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { sessionId } = useParams()
  
  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [benchmarkData, setBenchmarkData] = useState([])
  const [portfolioData, setPortfolioData] = useState([])
  const [benchmarkIndex, setBenchmarkIndex] = useState('SP500')
  const [showSummary, setShowSummary] = useState(false)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/game/sessions/${sessionId}/status`).then(d => { if (d) setStatus(d) }),
      apiFetch(`/game/sessions/${sessionId}/summary`).then(d => { if (d) setSummary(d) }),
      apiFetch(`/game/sessions/${sessionId}/result`).then(d => { if (d) setResult(d) }),
    ]).finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!status) return
    if (!status.active || status.is_expired) return
    // Benchmark window = the game's elapsed days (not full duration), so the
    // 0% baseline of both lines is the game start date.
    const days = Math.max(2, Math.ceil(status.days_elapsed ?? status.duration_days))

    apiFetch(`/game/sessions/${sessionId}/analytics/performance`)
      .then(data => {
        if (data?.snapshots) {
          const startVal = data.starting_value
          setPortfolioData(data.snapshots.map(s => ({
            date: s.date.split('T')[0],
            change_pct: ((s.value - startVal) / startVal) * 100,
            value: s.value,
          })))

          // Fewer than 2 snapshots renders the day-one placeholder instead of
          // the chart, so skip the benchmark call entirely until then.
          if (data.snapshots.length >= 2) {
            apiFetch(`/game/benchmark/${benchmarkIndex}?days=${days}`)
              .then(bd => { if (Array.isArray(bd)) setBenchmarkData(bd) })
          }
        }
      })
  }, [status, benchmarkIndex, sessionId])

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
  const locale = isKo ? 'ko-KR' : 'en-US'
  const openReplaySetup = (completedResult) => {
    navigate('/games/new', {
      state: {
        setupDefaults: {
          title: completedResult.title || status?.title || '',
          starting_balance_krw: status?.starting_balance_krw ?? completedResult.starting_value_krw,
          duration_days: completedResult.duration_days || status?.duration_days,
        },
      },
    })
  }

  if (loading) return <p>{t('common.loading')}</p>
  if (!status) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
      <button className="btn btn-primary" onClick={fetchData}>{t('common.retry')}</button>
    </div>
  )

  if (!status.active || status.is_expired) {
    if (!result) {
      return (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
          <button className="btn btn-primary" onClick={fetchData}>{t('common.retry')}</button>
        </div>
      )
    }

    const completedResult = result
    const returnTone = (completedResult.total_return_krw || 0) >= 0 ? 'positive' : 'negative'
    const hasReturnAmount = completedResult.total_return_krw !== null && completedResult.total_return_krw !== undefined
    const hasReturnPct = completedResult.total_return_pct !== null && completedResult.total_return_pct !== undefined
    const realizedCurrencies = completedResult.realized_pnl?.by_currency || {}
    const realizedEntries = Object.entries(realizedCurrencies)
    const holdings = completedResult.final_holdings || []
    const hasResultData = completedResult.result_data_available
    const statusLabel = t(sessionStatusLabelKey(completedResult))

    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">{completedResult.title || status.title || t('game.title')}</h1>
            <p className="page-subtitle">{t('game.completedSubtitle')}</p>
          </div>
          <div className="page-actions">
            <button type="button" className="btn" onClick={() => navigate(gamePath(sessionId, 'transactions'))}>
              {t('nav.transactions')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openReplaySetup(completedResult)}>
              {t('game.playAgain')}
            </button>
          </div>
        </div>

        <div className="game-status-bar game-expired">
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{statusLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('game.completedBody')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {formatDateTime(completedResult.start_date || status.start_date, locale, false)} → {formatDateTime(completedResult.end_date || status.end_date, locale, false)}
            </div>
          </div>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => navigate('/games')}>{t('nav.myGames')}</button>
        </div>

        {!hasResultData && (
          <div className="summary-card">
            <div className="summary-title">{t('game.resultUnavailableTitle')}</div>
            <p className="summary-body">{t('game.resultUnavailableBody')}</p>
          </div>
        )}

        <div className="metric-grid">
          <ResultMetric label={t('game.startingValue')}>
            {formatKRW(completedResult.starting_value_krw)}
          </ResultMetric>
          <ResultMetric label={t('game.endingValue')}>
            {completedResult.ending_value_krw === null || completedResult.ending_value_krw === undefined
              ? t('common.unavailable')
              : formatKRW(completedResult.ending_value_krw)}
          </ResultMetric>
          <ResultMetric label={t('game.totalReturnAmount')} tone={hasReturnAmount ? returnTone : ''}>
            {!hasReturnAmount
              ? t('common.unavailable')
              : `${completedResult.total_return_krw >= 0 ? '+' : ''}${formatKRW(completedResult.total_return_krw)}`}
          </ResultMetric>
          <ResultMetric label={t('game.totalReturnPct')} tone={hasReturnPct ? returnTone : ''}>
            {!hasReturnPct
              ? t('common.unavailable')
              : `${completedResult.total_return_pct >= 0 ? '+' : ''}${completedResult.total_return_pct}%`}
          </ResultMetric>
        </div>

        <div className="metric-grid">
          <ResultMetric label={t('game.finalCashKrw')}>
            {formatMoney(completedResult.final_cash_krw, 'KRW')}
          </ResultMetric>
          <ResultMetric label={t('game.finalCashUsd')}>
            {formatMoney(completedResult.final_cash_usd, 'USD')}
          </ResultMetric>
          <ResultMetric label={t('game.totalTrades')}>
            {completedResult.trade_count ?? 0}
          </ResultMetric>
          <ResultMetric label={t('game.exchangeCount')}>
            {completedResult.exchange_count ?? 0}
          </ResultMetric>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t('analytics.realizedPnl')}</div>
          {realizedEntries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              {t('game.realizedUnavailable')}
            </p>
          ) : (
            <div className="metric-grid" style={{ marginBottom: 0 }}>
              {realizedEntries.map(([currency, amount]) => (
                <ResultMetric key={currency} label={currency} tone={amount >= 0 ? 'positive' : 'negative'}>
                  {amount >= 0 ? '+' : ''}{formatMoney(amount, currency)}
                </ResultMetric>
              ))}
            </div>
          )}
        </div>

        {(completedResult.best_stock || completedResult.worst_stock) && (
          <div className="metric-grid">
            {completedResult.best_stock && (
              <ResultMetric label={t('game.bestStock')} tone={completedResult.best_stock.realized_pnl >= 0 ? 'positive' : 'negative'}>
                {getStockName(completedResult.best_stock.ticker, completedResult.best_stock.name, i18n.language)}
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {completedResult.best_stock.realized_pnl >= 0 ? '+' : ''}{formatMoney(completedResult.best_stock.realized_pnl, completedResult.best_stock.currency)}
                </div>
              </ResultMetric>
            )}
            {completedResult.worst_stock && (
              <ResultMetric label={t('game.worstStock')} tone={completedResult.worst_stock.realized_pnl >= 0 ? 'positive' : 'negative'}>
                {getStockName(completedResult.worst_stock.ticker, completedResult.worst_stock.name, i18n.language)}
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {completedResult.worst_stock.realized_pnl >= 0 ? '+' : ''}{formatMoney(completedResult.worst_stock.realized_pnl, completedResult.worst_stock.currency)}
                </div>
              </ResultMetric>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-title">{t('game.finalHoldings')}</div>
          {holdings.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <h2 style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>
                {t('game.noFinalHoldingsTitle')}
              </h2>
              <p>{completedResult.trade_count ? t('game.noFinalHoldingsSold') : t('game.noTradesBody')}</p>
            </div>
          ) : (
            <div>
              {holdings.map((holding) => (
                <div key={`${holding.market}-${holding.ticker}`} className="interactive-row" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 0', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>
                      {getStockName(holding.ticker, holding.name, i18n.language)}
                    </strong>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {holding.ticker} · {holding.market}{holding.sector ? ` · ${holding.sector}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {t('holdings.shares', { count: holding.quantity })}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {t('holdings.avgPrice')} {formatMoney(holding.avg_price, holding.currency)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {t('game.bookCost')} {formatMoney(holding.book_cost, holding.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cta-row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => openReplaySetup(completedResult)}>
            {t('game.playAgain')}
          </button>
          <button className="btn" onClick={() => navigate(gamePath(sessionId, 'portfolio'))}>
            {t('nav.portfolio')}
          </button>
          <button className="btn" onClick={() => navigate(gamePath(sessionId, 'analytics'))}>
            {t('nav.analytics')}
          </button>
        </div>
      </div>
    )
  }

  // Summary view
  if (showSummary && summary) {
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
              {t('game.buysSellsSummary', { buys: summary.total_buys, sells: summary.total_sells })}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">{t('analytics.winRate')}</div>
            <div className="metric-value">{summary.win_rate}%</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('game.winLossSummary', { wins: summary.winning_trades, losses: summary.losing_trades })}</div>
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
            onClick={() => navigate('/games')}>{t('nav.myGames')}</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('game.title')}</h1>
          <p className="page-subtitle">{t('game.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => navigate(gamePath(sessionId, 'dashboard'))}>
            {t('nav.dashboard')}
          </button>
          <button type="button" className="btn" onClick={() => navigate('/games')}>
            {t('nav.myGames')}
          </button>
        </div>
      </div>

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
          {status.is_expired ? (t('game.endedTitle')) : (t('game.gameActive'))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {status.is_expired ? t('game.endedBody') : `${new Date(status.start_date).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')} → ${new Date(status.end_date).toLocaleDateString(i18n.language === 'ko' ? 'ko-KR' : 'en-US')}`}
          </div>
          {status.is_expired && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              {t('game.tradeUnavailableEnded')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => setShowSummary(true)}>{t('game.summary')}</button>
          <button className="btn" style={{ fontSize: 13, border: '1px solid var(--border)' }}
            onClick={() => navigate('/games')}>{t('nav.myGames')}</button>
        </div>
      </div>

      {/* Benchmark Chart */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>{t('game.vsBenchmark')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['SP500', 'KOSPI'].map(idx => (
              <button key={idx} className={`btn segmented-button ${benchmarkIndex === idx ? 'segmented-button-selected' : ''}`} onClick={() => setBenchmarkIndex(idx)} style={{
                fontSize: 12, padding: '4px 10px',
              }}>{idx === 'SP500' ? 'S&P 500' : 'KOSPI'}</button>
            ))}
          </div>
        </div>

        {portfolioData.length < 2 ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t('game.chartInsufficientTitle')}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>{t('game.chartInsufficientBody')}</div>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, textAlign: 'left', fontSize: 14 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>1️⃣</span>
                <span>{t('game.day1StepSearch')}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>2️⃣</span>
                <span>{t('game.day1StepExchange')}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 18 }}>3️⃣</span>
                <span>{t('game.day1StepCompare')}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>{t('game.chartCaption')}</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mergedChartData}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${new Date(v).getMonth() + 1}/${new Date(v).getDate()}`} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(value, name) => [`${value?.toFixed(2)}%`, name]}
                  labelStyle={{ fontSize: 12 }} contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13 }} />
                <Legend />
                <Line type="monotone" dataKey="portfolio" stroke="var(--accent)" strokeWidth={2}
                  dot={mergedChartData.length <= 2 ? { r: 5, fill: 'var(--accent)', stroke: '#fff', strokeWidth: 2 } : false}
                  name={t('game.myPortfolio')} connectNulls />
                <Line type="monotone" dataKey="benchmark" stroke="var(--text-secondary)" strokeWidth={1.5}
                  dot={mergedChartData.length <= 2 ? { r: 4, fill: 'var(--text-secondary)', stroke: '#fff', strokeWidth: 2 } : false}
                  strokeDasharray="4 4"
                  name={benchmarkIndex === 'SP500' ? 'S&P 500' : 'KOSPI'} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  )
}

export default Game
