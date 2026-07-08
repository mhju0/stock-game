import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apiFetch, apiPost } from '../api'
import { formatDateTime, formatMoney } from '../utils/formatters'

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

function GameLimitNote({ t }) {
  return (
    <div style={{ textAlign: 'left', marginBottom: 18 }}>
      <p style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: 8 }}>
        {t('games.singleGameNote')}
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, marginBottom: 8 }}>
        {t('games.restartWarning')}
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>
        {t('games.setupComingSoon')}
      </p>
    </div>
  )
}

function RestartConfirmation({ t, starting, onConfirm, onCancel }) {
  return (
    <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: 16 }}>
      <div className="summary-title">{t('games.restartConfirmTitle')}</div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
        {t('games.restartWarning')}
      </p>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
        {t('games.setupComingSoon')}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={starting}>
          {starting ? t('common.loading') : t('games.confirmRestart')}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={starting}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

function GameSessionCard({ session, locale, onOpen, actionLabel, t }) {
  const isActive = session.status === 'active'
  return (
    <div
      className="card"
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'block',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {t('games.cardTitle')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {formatDateTime(session.start_date, locale, false)} {t('games.startedAt')}
          </div>
        </div>
        <span
          style={{
            color: isActive ? 'var(--positive)' : 'var(--negative)',
            background: isActive ? 'var(--positive-bg)' : 'var(--negative-bg)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 700,
            alignSelf: 'flex-start',
          }}
        >
          {isActive ? t('games.statusActive') : t('games.statusExpired')}
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

      <button
        type="button"
        className="btn btn-primary"
        onClick={onOpen}
        style={{ width: '100%', marginTop: 16 }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

function Games() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [confirmingNewGame, setConfirmingNewGame] = useState(false)
  const [error, setError] = useState('')

  const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US'

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError('')
    const data = await apiFetch('/game/sessions', {}, setError)
    if (data && Array.isArray(data.sessions)) {
      setSessions(data.sessions)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const requestRestart = () => {
    setConfirmingNewGame(true)
  }

  const confirmRestart = async () => {
    setStarting(true)
    setError('')
    const data = await apiPost(
      '/game/new',
      { starting_balance_krw: 10_000_000, duration_days: 90 },
      setError
    )
    setStarting(false)
    if (data) navigate('/', { replace: true })
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

  if (sessions.length === 0) {
    return (
      <div>
        <PageState
          title={t('games.emptyTitle')}
          body={t('games.emptyBody')}
          actionLabel={t('games.startFirst')}
          onAction={requestRestart}
          loading={starting}
        >
          <GameLimitNote t={t} />
        </PageState>
        {confirmingNewGame && (
          <RestartConfirmation
            t={t}
            starting={starting}
            onConfirm={confirmRestart}
            onCancel={() => setConfirmingNewGame(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)', marginBottom: 4 }}>
            {t('games.activeTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {t('games.selectBody')}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
            {t('games.singleGameNote')}
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {t('games.setupComingSoon')}
          </p>
        </div>
        <button type="button" className="btn" onClick={requestRestart} disabled={starting || confirmingNewGame}>
          {starting ? t('common.loading') : t('games.restart')}
        </button>
      </div>

      {confirmingNewGame && (
        <RestartConfirmation
          t={t}
          starting={starting}
          onConfirm={confirmRestart}
          onCancel={() => setConfirmingNewGame(false)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {sessions.map((session) => (
          <GameSessionCard
            key={session.id}
            session={session}
            locale={locale}
            onOpen={() => navigate('/')}
            actionLabel={t('games.continue')}
            t={t}
          />
        ))}
      </div>
    </div>
  )
}

export default Games
