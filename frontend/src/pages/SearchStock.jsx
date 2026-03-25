import { apiFetch, apiPost } from '../api'
import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import TradeModal from '../components/TradeModal'
import { getStockName } from '../utils/stockNames'
import { UserContext } from '../context/UserContext'


function SearchStock() {
  const { t, i18n } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [stock, setStock] = useState(null)
  const [history, setHistory] = useState([])
  const [historyPeriod, setHistoryPeriod] = useState('1mo')
  const [searching, setSearching] = useState(false)
  const [tradeTicker, setTradeTicker] = useState(null)
  const [message, setMessage] = useState('')
  const [loadingStock, setLoadingStock] = useState(false)

  useEffect(() => {
    if (query.length < 1) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      const data = await apiFetch(`/stock/search/${encodeURIComponent(query)}`)
      if (data) setResults(data)
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!stock) return
    apiFetch(`/stock/${stock.ticker}/history?period=${historyPeriod}`)
      .then(data => { if (Array.isArray(data)) setHistory(data) })
  }, [stock?.ticker, historyPeriod])

  const selectStock = async (ticker) => {
    setResults([])
    setQuery('')
    setHistory([])
    setStock(null)
    setLoadingStock(true)
    const data = await apiFetch(`/stock/${ticker}`)
    setLoadingStock(false)
    if (data && !data.error) setStock(data)
  }

  const addToWatchlist = async () => {
    setMessage('')
    const data = await apiFetch(`/watchlist/add?ticker=${stock.ticker}&user_id=${currentUserId}`, { method: 'POST' })
    if (data) setMessage(`${getStockName(stock.ticker, stock.name, i18n.language)} → ${t('watchlist.title')}`)
  }

  const displayName = stock ? getStockName(stock.ticker, stock.name, i18n.language) : ''
  const fmt = (v) => stock?.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`

  const chartData = history.map(h => ({
    date: h.date,
    close: h.close,
    label: new Date(h.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
  }))

  const priceChange = chartData.length >= 2
    ? chartData[chartData.length - 1].close - chartData[0].close
    : 0
  const priceChangePct = chartData.length >= 2
    ? ((priceChange / chartData[0].close) * 100).toFixed(2)
    : 0

  return (
    <div>
      <div className="card">
        <input
          className="input"
          placeholder="Apple, 삼성전자, TSLA..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ fontSize: 16 }}
          autoFocus
        />

        {searching && <p style={{ padding: '12px 0', color: 'var(--text-secondary)', fontSize: 13 }}>{t('common.loading')}</p>}

        {results.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {results.map(r => {
              const name = getStockName(r.ticker, r.name_en || r.name, i18n.language)
              return (
                <div key={r.ticker} onClick={() => selectStock(r.ticker)} className="search-result-row">
                  <strong style={{ fontSize: 15 }}>{name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.ticker} · {r.exchange}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {message && (
        <div className="card" style={{ color: 'var(--positive)', fontSize: 14 }}>{message}</div>
      )}

      {loadingStock && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
          {t('common.loading')}
        </div>
      )}

      {stock && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>{displayName}</h2>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{stock.ticker} · {stock.market}</span>
            </div>
            <button className="btn" onClick={addToWatchlist}
              style={{ fontSize: 13, border: '1px solid var(--border)' }}>
              + {t('watchlist.title')}
            </button>
          </div>

          <div className="price-hero">
            <div className="price-hero-label">{t('stock.price')}</div>
            <div className="price-hero-value">{fmt(stock.price)}</div>
            {chartData.length >= 2 && (
              <div className={priceChange >= 0 ? 'positive' : 'negative'} style={{ fontSize: 14, marginTop: 4 }}>
                {priceChange >= 0 ? '+' : ''}{stock.currency === 'KRW' ? `₩${Math.round(Math.abs(priceChange)).toLocaleString()}` : `$${Math.abs(priceChange).toFixed(2)}`} ({priceChangePct}%)
              </div>
            )}
          </div>

          {chartData.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 12, justifyContent: 'flex-end' }}>
                {['1d', '1w', '1mo', '3mo', '1y'].map(p => (
                  <button key={p} className="btn" onClick={() => setHistoryPeriod(p)} style={{
                    fontSize: 12, padding: '4px 10px',
                    background: historyPeriod === p ? 'var(--text-primary)' : 'transparent',
                    color: historyPeriod === p ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}>{p.toUpperCase()}</button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 5) - 1)} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickLine={false} axisLine={false}
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tickFormatter={v => stock.currency === 'KRW' ? `₩${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`} />
                  <Tooltip
                    formatter={(value) => [stock.currency === 'KRW' ? `₩${Math.round(value).toLocaleString()}` : `$${value.toFixed(2)}`, '']}
                    contentStyle={{ borderRadius: 12, border: '1px solid var(--border)', fontSize: 13, background: 'var(--card-bg)' }}
                  />
                  <Line type="monotone" dataKey="close" stroke={priceChange >= 0 ? '#34c759' : '#ff3b30'}
                    strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="metric-grid">
            <div className="metric-card" style={{ background: 'var(--bg-secondary)' }}>
              <div className="metric-label">{t('stock.sector')}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{stock.sector}</div>
            </div>
            <div className="metric-card" style={{ background: 'var(--bg-secondary)' }}>
              <div className="metric-label">{t('stock.industry')}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{stock.industry}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-buy" style={{ flex: 1 }}
              onClick={() => setTradeTicker(stock.ticker)}>{t('stock.buy')} / {t('stock.sell')}</button>
          </div>
        </div>
      )}

      {tradeTicker && (
        <TradeModal
          ticker={tradeTicker}
          onClose={() => setTradeTicker(null)}
          onComplete={() => { setTradeTicker(null) }}
        />
      )}
    </div>
  )
}

export default SearchStock