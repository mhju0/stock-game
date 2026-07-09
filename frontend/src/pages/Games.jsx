import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apiFetch, apiPost } from '../api'
import { formatDateTime, formatMoney } from '../utils/formatters'
import { gamePath, sessionStatusLabelKey } from '../sessionRoutes'

function PageState({ title, body, actionLabel, onAction, loading = false, children }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
      <h1 style={{ fontSize: 22, marginBottom: 10, fontFamily: 'var(--font-display)' }}>
        {title}
      </h1>
      {body && (
        <p style={{ color: 'var(--text-secondary)', marginBottom: actionLabel ? 22 : 0 }}>
          {body}
        </p>
      )}
      {children}
      {actionLabel && (
        <button type="button" className="btn btn-primary" onClick={onAction} disabled={loading}>
          {loading ? '...' : actionLabel}
        </button>
      )}
    </div>
  )
}

function GameSetupForm({ t, onCancel, onCreated }) {
  const [title, setTitle] = useState('')
  const [startingCash, setStartingCash] = useState('10000000')
  const [durationDays, setDurationDays] = useState('90')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const titleTooLong = title.trim().length > 80
  const startingValue = Number(startingCash)
  const durationValue = Number(durationDays)
  const invalidStartingCash = !Number.isFinite(startingValue) || startingValue <= 0
  const invalidDuration = !Number.isFinite(durationValue) || durationValue <= 0
  const disabled = creating || titleTooLong || invalidStartingCash || invalidDuration

  const submit = async (event) => {
    event.preventDefault()
    if (disabled) return

    setCreating(true)
    setError('')
    const data = await apiPost(
      '/game/sessions',
      {
        title: title.trim() || null,
        starting_balance_krw: startingValue,
        duration_days: Math.round(durationValue),
      },
      setError
    )
    setCreating(false)
    if (data?.session?.id) onCreated(data.session)
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
      <div className="card-title">{t('games.setupTitle')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label>
          <div className="metric-label">{t('games.gameName')}</div>
          <input
            className="input"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('games.gameNamePlaceholder')}
          />
          {titleTooLong && (
            <div style={{ color: 'var(--negative)', fontSize: 12, marginTop: 4 }}>
              {t('games.titleTooLong')}
            </div>
          )}
        </label>
        <label>
          <div className="metric-label">{t('games.startingCash')}</div>
          <input
            className="input"
            type="number"
            min="1"
            step="100000"
            value={startingCash}
            onChange={(event) => setStartingCash(event.target.value)}
          />
        </label>
        <label>
          <div className="metric-label">{t('games.duration')}</div>
          <input
            className="input"
            type="number"
            min="1"
            step="1"
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
          />
        </label>
      </div>
      {(invalidStartingCash || invalidDuration) && (
        <div style={{ color: 'var(--negative)', fontSize: 13, marginTop: 12 }}>
          {t('games.setupValidation')}
        </div>
      )}
      {error && <div style={{ color: 'var(--negative)', fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {creating ? t('common.loading') : t('games.startGame')}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel} disabled={creating}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  )
}

function GameSessionCard({ session, locale, onOpen, t }) {
  const isPlayable = session.status === 'active' && !session.is_expired
  return (
    <button
      type="button"
      className="card interactive-card-button"
      onClick={onOpen}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'block',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {session.title || t('games.cardTitle')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {formatDateTime(session.start_date, locale, false)} {t('games.startedAt')}
          </div>
        </div>
        <span
          style={{
            color: isPlayable ? 'var(--positive)' : 'var(--text-secondary)',
            background: isPlayable ? 'var(--positive-bg)' : 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 700,
            alignSelf: 'flex-start',
          }}
        >
          {t(sessionStatusLabelKey(session))}
        </span>
      </div>

      <div className="metric-grid" style={{ marginBottom: 0 }}>
        <div>
          <div className="metric-label">{t('games.currentValue')}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {formatMoney(session.current_value_krw, 'KRW')}
          </div>
        </div>
        <div>
          <div className="metric-label">{t('games.return')}</div>
          <div className={session.current_return_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 18, fontWeight: 700 }}>
            {session.current_return_pct >= 0 ? '+' : ''}{session.current_return_pct}%
          </div>
        </div>
        <div>
          <div className="metric-label">{t('games.duration')}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t('games.days', { count: session.duration_days })}</div>
        </div>
        <div>
          <div className="metric-label">{t('games.lastUpdated')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {formatDateTime(session.last_updated_at, locale)}
          </div>
        </div>
      </div>

      <div className="btn btn-primary" style={{ width: '100%', marginTop: 16, textAlign: 'center' }}>
        {isPlayable ? t('games.continue') : t('games.view')}
      </div>
    </button>
  )
}

function Games({ startSetup = false }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSetup, setShowSetup] = useState(startSetup)
  const [error, setError] = useState('')

  const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US'

  useEffect(() => {
    if (startSetup) setShowSetup(true)
  }, [startSetup])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    const data = await apiFetch('/game/sessions?include_all=true', {}, setError)
    if (data && Array.isArray(data.sessions)) {
      setSessions(data.sessions)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'active' && !session.is_expired),
    [sessions]
  )
  const otherSessions = useMemo(
    () => sessions.filter((session) => !(session.status === 'active' && !session.is_expired)),
    [sessions]
  )

  const handleCreated = (session) => {
    navigate(gamePath(session.id), { replace: true })
  }

  if (loading) {
    return <PageState title={t('games.loading')} />
  }

  if (error) {
    return (
      <PageState
        title={t('games.errorTitle')}
        body={error}
        actionLabel={t('games.retry')}
        onAction={loadSessions}
      />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)', marginBottom: 4 }}>
            {t('games.title')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {t('games.selectBody')}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowSetup(true)}>
          {t('games.create')}
        </button>
      </div>

      {showSetup && (
        <GameSetupForm
          t={t}
          onCancel={sessions.length > 0 ? () => setShowSetup(false) : null}
          onCreated={handleCreated}
        />
      )}

      {sessions.length === 0 && !showSetup && (
        <PageState
          title={t('games.emptyTitle')}
          body={t('games.emptyBody')}
          actionLabel={t('games.create')}
          onAction={() => setShowSetup(true)}
        />
      )}

      {activeSessions.length > 0 && (
        <>
          <div className="summary-title" style={{ marginBottom: 10 }}>{t('games.activeTitle')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 20 }}>
            {activeSessions.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                locale={locale}
                onOpen={() => navigate(gamePath(session.id))}
                t={t}
              />
            ))}
          </div>
        </>
      )}

      {otherSessions.length > 0 && (
        <>
          <div className="summary-title" style={{ marginBottom: 10 }}>{t('games.pastTitle')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {otherSessions.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                locale={locale}
                onOpen={() => navigate(gamePath(session.id))}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Games
