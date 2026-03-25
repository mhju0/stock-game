import { apiFetch } from '../api'
import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../context/UserContext'
import { getStockName } from '../utils/stockNames'
import { formatMoney, formatDateTime } from '../utils/formatters'


function Transactions() {
  const { t, i18n } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    setLoading(true)
    apiFetch(`/portfolio/transactions?user_id=${currentUserId}`)
      .then(data => { if (data) setTransactions(data) })
      .finally(() => setLoading(false))
  }, [currentUserId])

  const filtered = filter === 'ALL'
    ? transactions
    : transactions.filter(tx => tx.transaction_type === filter)

  const filters = [
    { key: 'ALL', label: t('transactions.title') },
    { key: 'BUY', label: t('transactions.buy') },
    { key: 'SELL', label: t('transactions.sell') },
    { key: 'EXCHANGE', label: t('exchange.title') },
  ]

  if (loading) return <p>{t('common.loading')}</p>
  if (transactions.length === 0) {
    return <div className="empty-state">{t('transactions.empty')}</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {filters.map(f => (
          <button
            key={f.key}
            className="btn"
            onClick={() => setFilter(f.key)}
            style={{
              fontSize: 13, padding: '6px 14px',
              background: filter === f.key ? 'var(--text-primary)' : 'transparent',
              color: filter === f.key ? 'white' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.map(tx => {
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
            <div key={tx.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 0', borderBottom: '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12,
                  fontWeight: 600, background: typeBg, color: typeColor,
                  minWidth: 40, textAlign: 'center',
                }}>
                  {typeLabel}
                </span>
                <div>
                  <strong style={{ fontSize: 15 }}>
                    {tx.transaction_type === 'EXCHANGE' ? tx.ticker : stockName}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {tx.transaction_type === 'EXCHANGE'
                      ? `${t('exchange.currentRate')}: ₩${tx.price.toLocaleString()}`
                      : `${tx.quantity}${tx.quantity !== 1 ? '' : ''} × ${fmt(tx.price)}`}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(tx.total_amount)}</div>
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