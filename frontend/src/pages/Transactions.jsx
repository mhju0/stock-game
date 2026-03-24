import { apiGet } from '../api'
import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../context/UserContext'


function Transactions() {
  const { t } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    apiGet(`/portfolio/transactions?user_id=${currentUserId}`, setTransactions)
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
              border: '1px solid #e5e5e7',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.map(tx => {
          const fmt = v => tx.currency === 'KRW' ? `₩${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`
          const date = new Date(tx.created_at).toLocaleDateString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          })
          const typeColor = tx.transaction_type === 'BUY' ? 'var(--positive)'
            : tx.transaction_type === 'SELL' ? 'var(--negative)' : 'var(--accent)'
          const typeBg = tx.transaction_type === 'BUY' ? 'var(--positive-bg)'
            : tx.transaction_type === 'SELL' ? 'var(--negative-bg)' : 'var(--accent-bg)'
          const typeLabel = tx.transaction_type === 'BUY' ? t('transactions.buy')
            : tx.transaction_type === 'SELL' ? t('transactions.sell') : t('exchange.title')

          return (
            <div key={tx.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 0', borderBottom: '1px solid #f5f5f7',
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
                    {tx.transaction_type === 'EXCHANGE' ? tx.ticker : tx.name}
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