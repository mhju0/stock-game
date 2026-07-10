import { apiFetch } from '../api'
import { useState, useEffect, useContext, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { UserContext } from '../context/userContext'
import { getStockName } from '../utils/stockNames'
import { formatMoney, formatDateTime } from '../utils/formatters'
import { gamePath } from '../sessionRoutes'


function Transactions() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { sessionId } = useParams()
  const { currentUserId } = useContext(UserContext)

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('ALL')

  const fetchTransactions = useCallback(() => {
    setLoading(true)
    setError('')
    apiFetch(`/game/sessions/${sessionId}/portfolio/transactions`, {}, setError)
      .then(data => { if (data) setTransactions(data) })
      .finally(() => setLoading(false))
  }, [sessionId])

  useEffect(() => { fetchTransactions() }, [fetchTransactions, currentUserId])

  const filtered = filter === 'ALL'
    ? transactions
    : transactions.filter(tx => tx.transaction_type === filter)

  const filters = [
    { key: 'ALL', label: t('transactions.filterAll') },
    { key: 'BUY', label: t('transactions.buy') },
    { key: 'SELL', label: t('transactions.sell') },
    { key: 'EXCHANGE', label: t('exchange.title') },
  ]

  if (loading) return <p>{t('common.loading')}</p>
  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--negative)', marginBottom: 12 }}>{t('common.loadError')}</p>
        <button className="btn btn-primary" onClick={fetchTransactions}>{t('common.retry')}</button>
      </div>
    )
  }
  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <h2 style={{ fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('transactions.emptyTitle')}
        </h2>
        <p style={{ marginBottom: 18 }}>{t('transactions.emptyBody')}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate(gamePath(sessionId, 'search'))}>
          {t('nav.search')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {filters.map(f => (
          <button
            key={f.key}
            className={`btn segmented-button ${filter === f.key ? 'segmented-button-selected' : ''}`}
            onClick={() => setFilter(f.key)}
            style={{
              fontSize: 13, padding: '6px 14px',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            {t('transactions.emptyFilter')}
          </div>
        ) : filtered.map(tx => {
          const fmt = v => formatMoney(v, tx.currency)
          const date = formatDateTime(tx.created_at, i18n.language === 'ko' ? 'ko-KR' : 'en-US')
          const typeColor = tx.transaction_type === 'BUY' ? 'var(--positive)'
            : tx.transaction_type === 'SELL' ? 'var(--negative)' : 'var(--accent)'
          const typeBg = tx.transaction_type === 'BUY' ? 'var(--positive-bg)'
            : tx.transaction_type === 'SELL' ? 'var(--negative-bg)' : 'var(--accent-bg)'
          const typeLabel = tx.transaction_type === 'BUY' ? t('transactions.buy')
            : tx.transaction_type === 'SELL' ? t('transactions.sell') : t('exchange.title')
          const stockName = getStockName(tx.ticker, tx.name, i18n.language)

          return (
            <div key={tx.id} className="transaction-row">
              <div className="transaction-main">
                <span style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12,
                  fontWeight: 600, background: typeBg, color: typeColor,
                  minWidth: 40, textAlign: 'center', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {typeLabel}
                </span>
                <div style={{ minWidth: 0 }}>
                  {tx.transaction_type === 'EXCHANGE' ? (() => {
                    const fromCur = tx.currency
                    const toCur = tx.ticker.split('/')[1] || (fromCur === 'KRW' ? 'USD' : 'KRW')
                    const fromAmt = fromCur === 'KRW'
                      ? `₩${Math.round(tx.total_amount).toLocaleString()}`
                      : `$${Number(tx.total_amount).toFixed(2)}`
                    const convertedAmt = fromCur === 'KRW'
                      ? tx.total_amount / tx.price
                      : tx.total_amount * tx.price
                    const toAmt = toCur === 'KRW'
                      ? `₩${Math.round(convertedAmt).toLocaleString()}`
                      : `$${Number(convertedAmt).toFixed(2)}`
                    return (
                      <>
                        <strong style={{ fontSize: 15 }}>{fromAmt} → {toAmt}</strong>
                        <div className="row-meta" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          ₩{Number(tx.price).toLocaleString()} / $1
                        </div>
                      </>
                    )
                  })() : (
                    <>
                      <strong style={{ fontSize: 15 }}>{stockName}</strong>
                      <div className="row-meta" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {tx.quantity} × {fmt(tx.price)}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="transaction-meta">
                {tx.transaction_type === 'EXCHANGE' ? (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('exchange.title')}</div>
                ) : (
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(tx.total_amount)}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{date}</div>
                {tx.realized_pnl !== 0 && (
                  <div style={{ fontSize: 12, color: tx.realized_pnl > 0 ? 'var(--positive)' : 'var(--negative)' }}>
                    {tx.realized_pnl > 0 ? '+' : ''}{fmt(Math.abs(tx.realized_pnl))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Transactions
