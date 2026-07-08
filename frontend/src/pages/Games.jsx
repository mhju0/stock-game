import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { apiFetch, apiPost } from '../api'
import { formatDateTime, formatMoney } from '../utils/formatters'

function PageState({ title, body, actionLabel, onAction, loading = false }) {
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
      {actionLabel && (
        <button type="button" className="btn btn-primary" onClick={onAction} disabled={loading}>
          {loading ? '...' : actionLabel}
        </button>
      )}
    </div>
  )
}

function GameSessionCard({ session, locale, onOpen }) {
  const isActive = session.status === 'active'
  return (
    <button
      type="button"
      className="card"
      onClick={onOpen}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'block',
      }}
      aria-label="진행 중인 게임 열기"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            모의 투자 게임
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {formatDateTime(session.start_date, locale, false)} 시작
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
          {isActive ? '진행 중' : '기간 종료'}
        </span>
      </div>

      <div className="metric-grid" style={{ marginBottom: 0 }}>
        <div>
          <div className="metric-label">현재 평가액</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {formatMoney(session.current_value_krw, 'KRW')}
          </div>
        </div>
        <div>
          <div className="metric-label">수익률</div>
          <div className={session.current_return_pct >= 0 ? 'positive' : 'negative'} style={{ fontSize: 18, fontWeight: 700 }}>
            {session.current_return_pct >= 0 ? '+' : ''}{session.current_return_pct}%
          </div>
        </div>
        <div>
          <div className="metric-label">기간</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{session.duration_days}일</div>
        </div>
        <div>
          <div className="metric-label">최근 업데이트</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {formatDateTime(session.last_updated_at, locale)}
          </div>
        </div>
      </div>
    </button>
  )
}

function Games() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [starting, setStarting] = useState(false)
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

  useEffect(() => {
    if (!loading && sessions.length === 1) {
      setRedirecting(true)
      const timer = setTimeout(() => navigate('/', { replace: true }), 350)
      return () => clearTimeout(timer)
    }
  }, [loading, navigate, sessions.length])

  const startGame = async () => {
    if (sessions.length > 0) {
      const confirmed = window.confirm('새 게임을 시작하면 현재 진행 중인 게임이 종료되고 포트폴리오가 초기화됩니다. 계속할까요?')
      if (!confirmed) return
    }

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

  if (redirecting) {
    return <PageState title={t('games.redirecting')} />
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
      <PageState
        title={t('games.emptyTitle')}
        body={t('games.emptyBody')}
        actionLabel={t('games.start')}
        onAction={startGame}
        loading={starting}
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
        <button type="button" className="btn" onClick={startGame} disabled={starting}>
          {starting ? t('common.loading') : t('games.start')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {sessions.map((session) => (
          <GameSessionCard
            key={session.id}
            session={session}
            locale={locale}
            onOpen={() => navigate('/')}
          />
        ))}
      </div>
    </div>
  )
}

export default Games
