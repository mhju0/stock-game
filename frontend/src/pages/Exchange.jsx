import { useState, useEffect, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { UserContext } from '../context/UserContext'

const API = 'http://127.0.0.1:8000'

function Exchange() {
  const { t } = useTranslation()
  const { currentUserId } = useContext(UserContext)
  
  const [rate, setRate] = useState(null)
  const [account, setAccount] = useState(null)
  const [fromCurrency, setFromCurrency] = useState('KRW')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')

  const fetchData = () => {
    // Exchange rate is public, no user_id needed
    fetch(`${API}/exchange-rate`).then(r => r.json()).then(d => setRate(d.usd_to_krw))
    // Account details are private, needs user_id
    fetch(`${API}/portfolio/account?user_id=${currentUserId}`).then(r => r.json()).then(setAccount)
  }

  useEffect(() => { fetchData() }, [currentUserId])

  const toCurrency = fromCurrency === 'KRW' ? 'USD' : 'KRW'
  const converted = amount && rate
    ? fromCurrency === 'KRW' ? (parseFloat(amount) / rate) : (parseFloat(amount) * rate)
    : 0

  const execute = async () => {
    setMessage('')
    const res = await fetch(`${API}/trade/exchange?user_id=${currentUserId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_currency: fromCurrency, to_currency: toCurrency, amount: parseFloat(amount) }),
    })
    const data = await res.json()
    if (res.ok) {
      setMessage(`${t('exchange.title')} ${t('trade.buySuccess')}`)
      setAccount({ ...account, balance_krw: data.balance.krw, balance_usd: data.balance.usd })
      setAmount('')
    } else {
      setMessage(data.detail)
    }
  }

  if (!rate || !account) return <p>{t('common.loading')}</p>

  const krwQuick = [100000, 500000, 1000000, 5000000]
  const usdQuick = [100, 500, 1000, 5000]
  const quickAmounts = fromCurrency === 'KRW' ? krwQuick : usdQuick
  const fmtQuick = (v) => fromCurrency === 'KRW' ? `₩${(v / 10000).toLocaleString()}만` : `$${v.toLocaleString()}`

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
          <div style={{ fontSize: 11, color: '#86868b', marginTop: 2 }}>per $1 USD</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">{t('exchange.title')}</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn" onClick={() => { setFromCurrency('KRW'); setAmount('') }} style={{
            flex: 1, minWidth: 120,
            background: fromCurrency === 'KRW' ? '#007aff' : 'transparent',
            color: fromCurrency === 'KRW' ? 'white' : '#1d1d1f',
            border: '1px solid #e5e5e7',
          }}>KRW → USD</button>
          <button className="btn" onClick={() => { setFromCurrency('USD'); setAmount('') }} style={{
            flex: 1, minWidth: 120,
            background: fromCurrency === 'USD' ? '#007aff' : 'transparent',
            color: fromCurrency === 'USD' ? 'white' : '#1d1d1f',
            border: '1px solid #e5e5e7',
          }}>USD → KRW</button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {quickAmounts.map(v => (
            <button key={v} className="btn" onClick={() => setAmount(String(v))} style={{
              fontSize: 13, padding: '6px 12px',
              background: parseFloat(amount) === v ? '#f0f0f0' : 'transparent',
              border: '1px solid #e5e5e7',
            }}>
              {fmtQuick(v)}
            </button>
          ))}
          <button className="btn" onClick={() => {
            const max = fromCurrency === 'KRW' ? account.balance_krw : account.balance_usd
            setAmount(String(Math.floor(max)))
          }} style={{ fontSize: 13, padding: '6px 12px', border: '1px solid #e5e5e7', color: '#007aff' }}>
            MAX
          </button>
        </div>

        <input className="input" type="number" placeholder={t('exchange.amount')} value={amount}
          onChange={e => setAmount(e.target.value)} style={{ marginBottom: 12, fontSize: 16, textAlign: 'center' }} />

        {amount && (
          <div style={{
            background: '#f5f5f7', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, color: '#86868b' }}>{t('exchange.convertedAmount')}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {toCurrency === 'USD' ? `$${converted.toFixed(2)}` : `₩${Math.round(converted).toLocaleString()}`}
            </div>
          </div>
        )}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={execute} disabled={!amount}>
          {t('exchange.execute')}
        </button>

        {message && (
          <p style={{ marginTop: 12, textAlign: 'center', color: message.includes('완료') || message.includes('complete') ? '#34c759' : '#ff3b30' }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

export default Exchange