import { apiFetch } from '../api'
import { useState, useEffect, useContext, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext, useParams } from 'react-router-dom'
import { UserContext } from '../context/userContext'
import { useAccountQuery, useTradeMutation } from '../query/queries'
import { isSessionEnded } from '../sessionRoutes'


function Exchange() {
  const { t, i18n } = useTranslation()
  const { sessionId } = useParams()
  const { session } = useOutletContext() || {}
  const { currentUserId } = useContext(UserContext)
  const ended = isSessionEnded(session)
  
  const [rate, setRate] = useState(null)
  const [rateLoading, setRateLoading] = useState(true)
  const [rateError, setRateError] = useState('')
  const [fromCurrency, setFromCurrency] = useState('KRW')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const accountQuery = useAccountQuery(currentUserId, sessionId)
  const tradeMutation = useTradeMutation(currentUserId, sessionId)
  const account = accountQuery.data || null
  const loading = rateLoading || accountQuery.isLoading || (
    accountQuery.isFetching && accountQuery.data === undefined
  )

  const fetchRate = useCallback(() => {
    setRateLoading(true)
    setRateError('')
    apiFetch('/exchange-rate', {}, setRateError)
      .then((data) => {
        if (data) setRate(data.usd_to_krw)
      })
      .finally(() => setRateLoading(false))
  }, [])

  const fetchData = () => {
    fetchRate()
    accountQuery.refetch()
  }

  useEffect(() => { fetchRate() }, [fetchRate])

  const toCurrency = fromCurrency === 'KRW' ? 'USD' : 'KRW'
  const numericAmount = Number(amount)
  const hasAmount = amount !== ''
  const invalidAmount = hasAmount && (!Number.isFinite(numericAmount) || numericAmount <= 0)
  const availableBalance = account
    ? fromCurrency === 'KRW'
      ? account.balance_krw
      : account.balance_usd
    : 0
  const exceedsBalance = Number.isFinite(numericAmount) && numericAmount > availableBalance
  const converted = hasAmount && rate && !invalidAmount
    ? fromCurrency === 'KRW' ? (numericAmount / rate) : (numericAmount * rate)
    : 0
  const executeDisabled = submitting || !hasAmount || invalidAmount || exceedsBalance

  const execute = async () => {
    if (executeDisabled) return
    setMessage('')
    setIsSuccess(false)
    setSubmitting(true)
    try {
      const data = await tradeMutation.mutateAsync({
        type: 'exchange',
        payload: {
          from_currency: fromCurrency,
          to_currency: toCurrency,
          amount: numericAmount,
        },
      })
      if (!data?.exchange || !data?.balance) return
      const ex = data.exchange
      const fromFmt = ex.from === 'KRW' ? `₩${Math.round(ex.amount).toLocaleString()}` : `$${Number(ex.amount).toFixed(2)}`
      const toFmt = ex.to === 'KRW' ? `₩${Math.round(ex.converted).toLocaleString()}` : `$${Number(ex.converted).toFixed(2)}`
      setMessage(t('exchange.success', { from: fromFmt, to: toFmt }))
      setIsSuccess(true)
      setAmount('')
    } catch (error) {
      setMessage(error.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p>{t('common.loading')}</p>
  if (rateError || accountQuery.isError || !rate || !account) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ color: 'var(--negative)', marginBottom: 12 }}>
        {rateError || accountQuery.error?.message || t('common.loadError')}
      </p>
      <button className="btn btn-primary" onClick={fetchData}>{t('common.retry')}</button>
    </div>
  )

  if (ended) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>{t('game.endedTitle')}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
          {t('game.tradeUnavailableEnded')}
        </p>
      </div>
    )
  }

  const krwQuick = [10000, 50000, 100000, 500000, 1000000]
  const usdQuick = [100, 500, 1000, 5000]
  const quickAmounts = fromCurrency === 'KRW' ? krwQuick : usdQuick
  const fmtQuick = (v) => {
    if (fromCurrency === 'KRW') {
      return i18n.language === 'ko' ? `${(v / 10000).toLocaleString()}만원` : `₩${v.toLocaleString()}`
    }
    return `$${v.toLocaleString()}`
  }

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

        <div className="segmented-control" style={{ marginBottom: 16 }}>
          <button className={`btn segmented-button ${fromCurrency === 'KRW' ? 'segmented-button-selected' : ''}`} onClick={() => { setFromCurrency('KRW'); setAmount(''); setMessage('') }} style={{
            flex: 1, minWidth: 120,
          }}>KRW → USD</button>
          <button className={`btn segmented-button ${fromCurrency === 'USD' ? 'segmented-button-selected' : ''}`} onClick={() => { setFromCurrency('USD'); setAmount(''); setMessage('') }} style={{
            flex: 1, minWidth: 120,
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

        <input className="input" type="number" placeholder={t('exchange.amount')} aria-label={t('exchange.amount')} value={amount}
          onChange={e => setAmount(e.target.value)} style={{ marginBottom: 12, fontSize: 16, textAlign: 'center' }} />

        {hasAmount && !invalidAmount && (
          <div style={{
            background: 'var(--surface-panel-strong)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('exchange.convertedAmount')}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {toCurrency === 'USD' ? `$${converted.toFixed(2)}` : `₩${Math.round(converted).toLocaleString()}`}
            </div>
          </div>
        )}

        {(invalidAmount || exceedsBalance) && (
          <div className="trade-warning">
            {invalidAmount && <div>{t('exchange.invalidAmount')}</div>}
            {exceedsBalance && <div>{t('exchange.insufficientFunds')}</div>}
          </div>
        )}

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={execute} disabled={executeDisabled}>
          {submitting ? t('common.loading') : t('exchange.execute')}
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
