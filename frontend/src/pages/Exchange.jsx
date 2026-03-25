import { apiFetch, apiPost } from '../api'
import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../context/UserContext'


function Exchange() {
  const { t } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [rate, setRate] = useState(null)
  const [account, setAccount] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fromCurrency, setFromCurrency] = useState('KRW')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const fetchData = () => {
    setLoading(true)
    Promise.all([
      apiFetch('/exchange-rate').then(d => { if (d) setRate(d.usd_to_krw) }),
      apiFetch(`/portfolio/account?user_id=${currentUserId}`).then(d => { if (d) setAccount(d) }),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [currentUserId])

  const toCurrency = fromCurrency === 'KRW' ? 'USD' : 'KRW'
  const converted = amount && rate
    ? fromCurrency === 'KRW' ? (parseFloat(amount) / rate) : (parseFloat(amount) * rate)
    : 0

  const execute = async () => {
    setMessage('')
    setIsSuccess(false)
    const data = await apiPost(
      `/trade/exchange?user_id=${currentUserId}`,
      { from_currency: fromCurrency, to_currency: toCurrency, amount: parseFloat(amount) },
      (err) => setMessage(err)
    )
    if (data) {
      setMessage(`${t('exchange.title')} ${t('trade.buySuccess')}`)
      setIsSuccess(true)
      setAccount({ ...account, balance_krw: data.balance.krw, balance_usd: data.balance.usd })
      setAmount('')
    }
  }

  if (loading) return <p>{t('common.loading')}</p>
  if (!rate || !account) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>Failed to load exchange data. Is the backend running?</p>
      <button className="btn btn-primary" onClick={fetchData}>Retry</button>
    </div>
  )

  const krwQuick = [10000, 50000, 100000, 500000, 1000000]
  const usdQuick = [100, 500, 1000, 5000]
  const quickAmounts = fromCurrency === 'KRW' ? krwQuick : usdQuick
  const fmtQuick = (v) => fromCurrency === 'KRW' ? `${(v / 10000).toLocaleString()}만원` : `$${v.toLocaleString()}`

  return (
    <div>
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashKRW')}</div>
          <div className="metric-value">₩{Math.round(account.balance_krw).toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('dashboard.cashUSD')}</div>
          <div className="metric-value">${account.balance_usd.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{t('exchange.currentRate')}</div>
          <div className="metric-value">₩{rate.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{t('exchange.perUsd')}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t('exchange.title')}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn" onClick={() => { setFromCurrency('KRW'); setAmount('') }} style={{
            flex: 1, minWidth: 120,
            background: fromCurrency === 'KRW' ? 'var(--accent)' : 'transparent',
            color: fromCurrency === 'KRW' ? 'white' : 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}>KRW → USD</button>
          <button className="btn" onClick={() => { setFromCurrency('USD'); setAmount('') }} style={{
            flex: 1, minWidth: 120,
            background: fromCurrency === 'USD' ? 'var(--accent)' : 'transparent',
            color: fromCurrency === 'USD' ? 'white' : 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}>USD → KRW</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {quickAmounts.map(v => (
            <button key={v} className="btn" onClick={() => setAmount(String(v))} style={{
              fontSize: 13, padding: '6px 12px',
              background: parseFloat(amount) === v ? 'var(--border-light)' : 'transparent',
              border: '1px solid var(--border)',
            }}>
              {fmtQuick(v)}
            </button>
          ))}
          <button className="btn" onClick={() => {
            const max = fromCurrency === 'KRW' ? account.balance_krw : account.balance_usd
            setAmount(String(Math.floor(max)))
          }} style={{ fontSize: 13, padding: '6px 12px', border: '1px solid var(--border)', color: 'var(--accent)', fontWeight: 600 }}>
            {t('exchange.allFunds')}
          </button>
        </div>

        <input className="input" type="number" placeholder={t('exchange.amount')} value={amount}
          onChange={e => setAmount(e.target.value)} style={{ marginBottom: 12, fontSize: 16, textAlign: 'center' }} />

        {amount && (
          <div style={{
            background: 'var(--border-light)', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('exchange.convertedAmount')}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {toCurrency === 'USD' ? `$${converted.toFixed(2)}` : `₩${Math.round(converted).toLocaleString()}`}
            </div>
          </div>
        )}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={execute} disabled={!amount}>
          {t('exchange.execute')}
        </button>

        {message && (
          <p style={{ marginTop: 12, textAlign: 'center', color: isSuccess ? 'var(--positive)' : 'var(--negative)' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default Exchange