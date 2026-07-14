import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserContext } from '../context/userContext'
import {
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useSessionListQuery,
  useUpdateSessionMutation,
} from '../query/queries'
import { formatDateTime, formatMoney } from '../utils/formatters'
import { gamePath, sessionStatusLabelKey } from '../sessionRoutes'

const CASH_PRESETS = [
  { value: 1_000_000, labelKey: 'games.cashPreset1m' },
  { value: 5_000_000, labelKey: 'games.cashPreset5m' },
  { value: 10_000_000, labelKey: 'games.cashPreset10m' },
  { value: 50_000_000, labelKey: 'games.cashPreset50m' },
]

const DURATION_PRESETS = [
  { value: 7, labelKey: 'games.durationPreset7' },
  { value: 30, labelKey: 'games.durationPreset30' },
  { value: 90, labelKey: 'games.durationPreset90' },
  { value: 180, labelKey: 'games.durationPreset180' },
]

function parseIntegerInput(value) {
  const normalized = String(value).replace(/[^\d]/g, '')
  if (!normalized) return NaN
  return Number(normalized)
}

function formatIntegerInput(value) {
  const normalized = String(value).replace(/[^\d]/g, '')
  if (!normalized) return ''
  return Number(normalized).toLocaleString('ko-KR')
}

function normalizeSetupDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object') return null

  const startingBalance = Number(defaults.starting_balance_krw)
  const durationDays = Number(defaults.duration_days)

  return {
    title: typeof defaults.title === 'string' ? defaults.title : '',
    starting_balance_krw: Number.isFinite(startingBalance) && startingBalance > 0
      ? startingBalance
      : 10_000_000,
    duration_days: Number.isFinite(durationDays) && durationDays > 0
      ? Math.round(durationDays)
      : 30,
  }
}

function isPresetValue(presets, value) {
  return presets.some((preset) => preset.value === value)
}

function PageState({ title, body, actionLabel, onAction, loading = false, children }) {
  return (
    <div className="card page-state-card">
      <h1 className="page-state-title">
        {title}
      </h1>
      {body && (
        <p className="page-state-body">
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

function ModalShell({ titleId, title, descriptionId, description, closeLabel, onClose, children, maxWidth = 560 }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previousActiveElement = document.activeElement
    const preferredFocusable = dialogRef.current?.querySelector('[data-autofocus="true"]')
    const firstFocusable = preferredFocusable || dialogRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousActiveElement?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="modal-content game-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{ maxWidth }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="game-modal-header">
          <div>
            <h2 id={titleId} className="game-modal-title">{title}</h2>
            {description && (
              <p id={descriptionId} className="game-modal-subtitle">{description}</p>
            )}
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={closeLabel}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CreateGameModal({ t, initialSetup, onClose, onCreate, onCreated }) {
  const setupDefaults = normalizeSetupDefaults(initialSetup)
  const initialCash = setupDefaults?.starting_balance_krw || 10_000_000
  const initialDuration = setupDefaults?.duration_days || 30
  const [title, setTitle] = useState(setupDefaults?.title || '')
  const [cashMode, setCashMode] = useState(isPresetValue(CASH_PRESETS, initialCash) ? 'preset' : 'custom')
  const [cashInput, setCashInput] = useState(formatIntegerInput(String(initialCash)))
  const [durationMode, setDurationMode] = useState(isPresetValue(DURATION_PRESETS, initialDuration) ? 'preset' : 'custom')
  const [durationInput, setDurationInput] = useState(String(initialDuration))
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const cashInputRef = useRef(null)
  const durationInputRef = useRef(null)

  const titleTooLong = title.trim().length > 80
  const startingValue = parseIntegerInput(cashInput)
  const durationValue = parseIntegerInput(durationInput)
  const invalidStartingCash = !Number.isFinite(startingValue) || startingValue <= 0
  const invalidDuration = !Number.isFinite(durationValue) || durationValue <= 0
  const disabled = creating || titleTooLong || invalidStartingCash || invalidDuration

  const selectCashPreset = (value) => {
    setCashMode('preset')
    setCashInput(formatIntegerInput(String(value)))
  }

  const selectCustomCash = () => {
    setCashMode('custom')
    window.requestAnimationFrame(() => cashInputRef.current?.focus())
  }

  const selectDurationPreset = (value) => {
    setDurationMode('preset')
    setDurationInput(String(value))
  }

  const selectCustomDuration = () => {
    setDurationMode('custom')
    window.requestAnimationFrame(() => durationInputRef.current?.focus())
  }

  const submit = async (event) => {
    event.preventDefault()
    if (disabled) return

    setCreating(true)
    setError('')
    try {
      const data = await onCreate({
        title: title.trim() || null,
        starting_balance_krw: startingValue,
        duration_days: Math.round(durationValue),
      })
      if (data?.session?.id) onCreated(data.session)
    } catch (requestError) {
      setError(requestError.message || t('common.error'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <ModalShell
      titleId="create-game-title"
      title={t('games.setupTitle')}
      descriptionId="create-game-description"
      description={setupDefaults ? t('games.replaySetupHelper') : t('games.createModalHelper')}
      closeLabel={t('common.close')}
      onClose={creating ? () => null : onClose}
      maxWidth={640}
    >
      <form onSubmit={submit} className="game-create-form">
        <label>
          <span className="setup-label">{t('games.gameName')}</span>
          <input
            className="input"
            data-autofocus="true"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('games.gameNamePlaceholder')}
          />
          {titleTooLong && (
            <span className="form-error">{t('games.titleTooLong')}</span>
          )}
        </label>

        <section className="game-option-section" aria-labelledby="cash-preset-title">
          <div id="cash-preset-title" className="game-option-title">{t('games.startingCash')}</div>
          <div className="game-chip-grid">
            {CASH_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`game-chip ${cashMode === 'preset' && startingValue === preset.value ? 'game-chip-selected' : ''}`}
                onClick={() => selectCashPreset(preset.value)}
              >
                {t(preset.labelKey)}
              </button>
            ))}
            <button
              type="button"
              className={`game-chip ${cashMode === 'custom' ? 'game-chip-selected' : ''}`}
              onClick={selectCustomCash}
            >
              {t('games.customAmount')}
            </button>
          </div>
          {cashMode === 'custom' && (
            <label className="game-custom-field">
              <span className="setup-label">{t('games.customAmountLabel')}</span>
              <input
                ref={cashInputRef}
                className="input"
                inputMode="numeric"
                value={cashInput}
                onChange={(event) => setCashInput(formatIntegerInput(event.target.value))}
                placeholder="10,000,000"
              />
            </label>
          )}
          {invalidStartingCash && (
            <span className="form-error">{t('games.startingCashError')}</span>
          )}
        </section>

        <section className="game-option-section" aria-labelledby="duration-preset-title">
          <div id="duration-preset-title" className="game-option-title">{t('games.duration')}</div>
          <div className="game-chip-grid">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`game-chip ${durationMode === 'preset' && durationValue === preset.value ? 'game-chip-selected' : ''}`}
                onClick={() => selectDurationPreset(preset.value)}
              >
                {t(preset.labelKey)}
              </button>
            ))}
            <button
              type="button"
              className={`game-chip ${durationMode === 'custom' ? 'game-chip-selected' : ''}`}
              onClick={selectCustomDuration}
            >
              {t('games.customDuration')}
            </button>
          </div>
          {durationMode === 'custom' && (
            <label className="game-custom-field">
              <span className="setup-label">{t('games.customDurationLabel')}</span>
              <input
                ref={durationInputRef}
                className="input"
                inputMode="numeric"
                value={durationInput}
                onChange={(event) => setDurationInput(String(parseIntegerInput(event.target.value) || ''))}
                placeholder="30"
              />
            </label>
          )}
          {invalidDuration && (
            <span className="form-error">{t('games.durationError')}</span>
          )}
        </section>

        {error && <div className="form-error form-error-block">{error}</div>}

        <div className="game-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={creating}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={disabled}>
            {creating ? t('common.loading') : t('games.startGame')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function GameSessionCard({ session, locale, onOpen, onManage, t }) {
  const isPlayable = session.status === 'active'

  return (
    <div className="card game-session-card">
      <div className="game-card-topline">
        <div className="game-card-title-group">
          <div className="game-card-title">
            {session.title || t('games.cardTitle')}
          </div>
          <div className="game-card-date">
            {formatDateTime(session.start_date, locale, false)} {t('games.startedAt')}
          </div>
        </div>
        <div className="game-card-controls">
          <span className={`game-status-pill ${isPlayable ? 'game-status-pill-active' : ''}`}>
            {t(sessionStatusLabelKey(session))}
          </span>
          <button
            type="button"
            className="game-manage-btn"
            onClick={onManage}
            aria-label={t('games.manageGameAria', { title: session.title || t('games.cardTitle') })}
          >
            <span className="game-manage-text">{t('games.manageGame')}</span>
            <span aria-hidden="true" className="game-manage-dots">•••</span>
          </button>
        </div>
      </div>

      <div className="metric-grid game-card-metrics">
        <div>
          <div className="metric-label">{t('games.currentValue')}</div>
          <div className="game-card-metric-value">
            {formatMoney(session.current_value_krw, 'KRW')}
          </div>
        </div>
        <div>
          <div className="metric-label">{t('games.return')}</div>
          <div className={session.current_return_pct >= 0 ? 'positive game-card-metric-value' : 'negative game-card-metric-value'}>
            {session.current_return_pct >= 0 ? '+' : ''}{session.current_return_pct}%
          </div>
        </div>
        <div>
          <div className="metric-label">{t('games.duration')}</div>
          <div className="game-card-metric-value">{t('games.days', { count: session.duration_days })}</div>
        </div>
        <div>
          <div className="metric-label">{t('games.lastUpdated')}</div>
          <div className="game-card-muted">
            {formatDateTime(session.last_updated_at, locale)}
          </div>
        </div>
      </div>

      <button type="button" className="btn btn-primary game-open-btn" onClick={onOpen}>
        {isPlayable ? t('games.continue') : t('games.view')}
      </button>
    </div>
  )
}

function DetailItem({ label, children }) {
  return (
    <div className="game-detail-item">
      <div className="metric-label">{label}</div>
      <div className="game-detail-value">{children}</div>
    </div>
  )
}

function ArchiveGameModal({ session, t, onClose, onArchive, onArchived }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const archive = async () => {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const data = await onArchive(session.id, { status: 'archived' })
      if (data?.session) onArchived(data.session)
    } catch (requestError) {
      setError(requestError.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      titleId="archive-game-title"
      title={t('games.archiveConfirmTitle')}
      descriptionId="archive-game-description"
      description={t('games.archiveConfirmBody', { title: session.title || t('games.cardTitle') })}
      closeLabel={t('common.close')}
      onClose={submitting ? () => null : onClose}
      maxWidth={480}
    >
      <div className="delete-confirmation">
        {error && <div className="form-error form-error-block">{error}</div>}
        <div className="game-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={archive} disabled={submitting}>
            {submitting ? t('common.loading') : t('games.archiveGame')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function GameManagementModal({ session, locale, t, onClose, onSave, onUpdated, onRequestDelete, onRequestArchive }) {
  const [title, setTitle] = useState(session.title || '')
  const [submitting, setSubmitting] = useState('')
  const [error, setError] = useState('')
  const titleTooLong = title.trim().length > 80
  const titleUnchanged = title.trim() === (session.title || '').trim()

  const updateSession = async (payload, action) => {
    setSubmitting(action)
    setError('')
    try {
      const data = await onSave(session.id, payload)
      if (data?.session) onUpdated(data.session)
    } catch (requestError) {
      setError(requestError.message || t('common.error'))
    } finally {
      setSubmitting('')
    }
  }

  return (
    <ModalShell
      titleId="game-management-title"
      title={t('games.settingsTitle')}
      descriptionId="game-management-description"
      description={t('games.settingsSubtitle')}
      closeLabel={t('common.close')}
      onClose={submitting ? () => null : onClose}
      maxWidth={620}
    >
      <div className="game-management">
        <div className="game-management-hero">
          <div>
            <div className="game-card-title">{session.title || t('games.cardTitle')}</div>
            <div className="game-card-date">{t(sessionStatusLabelKey(session))}</div>
          </div>
          <span className={`game-status-pill ${session.status === 'active' ? 'game-status-pill-active' : ''}`}>
            {t(sessionStatusLabelKey(session))}
          </span>
        </div>

        <div className="game-detail-grid">
          <DetailItem label={t('games.startDate')}>
            {formatDateTime(session.start_date, locale)}
          </DetailItem>
          <DetailItem label={t('games.endDate')}>
            {formatDateTime(session.end_date, locale)}
          </DetailItem>
          <DetailItem label={t('games.startingCash')}>
            {formatMoney(session.starting_balance_krw, 'KRW')}
          </DetailItem>
          <DetailItem label={t('games.currentValue')}>
            {formatMoney(session.current_value_krw, 'KRW')}
          </DetailItem>
        </div>

        <label className="game-rename-field">
          <span className="setup-label">{t('games.gameName')}</span>
          <input
            className="input"
            data-autofocus="true"
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('games.gameNamePlaceholder')}
            disabled={Boolean(submitting)}
          />
          {titleTooLong && <span className="form-error">{t('games.titleTooLong')}</span>}
        </label>

        {error && <div className="form-error form-error-block">{error}</div>}

        <div className="game-settings-actions">
          <button
            type="button"
            className="btn"
            onClick={() => updateSession({ title: title.trim() || null }, 'rename')}
            disabled={Boolean(submitting) || titleTooLong || titleUnchanged}
          >
            {submitting === 'rename' ? t('common.loading') : t('games.saveName')}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onRequestArchive(session)}
            disabled={Boolean(submitting) || session.status === 'archived'}
          >
            {t('games.archiveGame')}
          </button>
        </div>

        <div className="danger-zone">
          <div>
            <div className="danger-zone-title">{t('games.deletePermanent')}</div>
            <p className="danger-zone-copy">{t('games.deleteHint')}</p>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onRequestDelete(session)}
            disabled={Boolean(submitting)}
          >
            {t('games.deleteGame')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function DeleteGameModal({ session, t, onClose, onDelete, onDeleted }) {
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const requiredPhrase = t('games.deleteConfirmPhrase')
  const canDelete = confirmation.trim() === requiredPhrase

  const deleteSession = async () => {
    if (!canDelete || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const data = await onDelete(session.id)
      if (data?.status === 'success') onDeleted()
    } catch (requestError) {
      setError(requestError.message || t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalShell
      titleId="delete-game-title"
      title={t('games.deleteConfirmTitle')}
      descriptionId="delete-game-description"
      description={t('games.deleteConfirmBody', { title: session.title || t('games.cardTitle') })}
      closeLabel={t('common.close')}
      onClose={submitting ? () => null : onClose}
      maxWidth={520}
    >
      <div className="delete-confirmation">
        <p className="delete-confirmation-scope">
          {t('games.deleteConfirmScope')}
        </p>
        <label>
          <span className="setup-label">{t('games.deleteConfirmPhraseLabel', { phrase: requiredPhrase })}</span>
          <input
            className="input"
            data-autofocus="true"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={t('games.deleteConfirmPlaceholder')}
            disabled={submitting}
          />
        </label>
        {error && <div className="form-error form-error-block">{error}</div>}
        <div className="game-modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={deleteSession}
            disabled={!canDelete || submitting}
          >
            {submitting ? t('common.loading') : t('games.deleteGame')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

function Games({ startSetup = false }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUserId } = useContext(UserContext)
  const sessionsQuery = useSessionListQuery(currentUserId, { includeAll: true })
  const createSessionMutation = useCreateSessionMutation(currentUserId)
  const updateSessionMutation = useUpdateSessionMutation(currentUserId)
  const deleteSessionMutation = useDeleteSessionMutation(currentUserId)
  const sessions = useMemo(
    () => Array.isArray(sessionsQuery.data?.sessions) ? sessionsQuery.data.sessions : [],
    [sessionsQuery.data?.sessions],
  )
  const loading = sessionsQuery.isLoading || (
    sessionsQuery.isFetching && !sessionsQuery.data
  )

  const [showSetup, setShowSetup] = useState(startSetup)
  const [setupDefaults, setSetupDefaults] = useState(() => normalizeSetupDefaults(location.state?.setupDefaults))
  const [managingSession, setManagingSession] = useState(null)
  const [deletingSession, setDeletingSession] = useState(null)
  const [archivingSession, setArchivingSession] = useState(null)
  const [coldStart, setColdStart] = useState(false)
  const coldStartTimerRef = useRef(null)

  const locale = i18n.language === 'ko' ? 'ko-KR' : 'en-US'

  // Render free tier spins down; a returning visitor's first request here can
  // take tens of seconds. After a short delay show the same hint Login uses
  // so this (the app's real entry point) doesn't look broken either.
  useEffect(() => {
    if (loading) {
      coldStartTimerRef.current = setTimeout(() => setColdStart(true), 4000)
    } else {
      clearTimeout(coldStartTimerRef.current)
      setColdStart(false)
    }
    return () => clearTimeout(coldStartTimerRef.current)
  }, [loading])

  useEffect(() => {
    if (startSetup) {
      setSetupDefaults(normalizeSetupDefaults(location.state?.setupDefaults))
      setShowSetup(true)
    }
  }, [startSetup, location.state])

  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'active'),
    [sessions]
  )
  const otherSessions = useMemo(
    () => sessions.filter((session) => session.status !== 'active'),
    [sessions]
  )

  const handleCreated = (session) => {
    navigate(gamePath(session.id), { replace: true })
  }

  const handleUpdated = () => {
    setManagingSession(null)
  }

  const handleDeleted = () => {
    setDeletingSession(null)
    setManagingSession(null)
    navigate('/games', { replace: true })
  }

  if (loading) {
    return <PageState title={t('games.loading')} body={coldStart ? t('auth.coldStartHint') : ''} />
  }

  if (sessionsQuery.isError) {
    return (
      <PageState
        title={t('games.errorTitle')}
        body={sessionsQuery.error?.message || t('common.loadError')}
        actionLabel={t('games.retry')}
        onAction={() => sessionsQuery.refetch()}
      />
    )
  }

  return (
    <div>
      <div className="page-header games-page-header">
        <div>
          <h1 className="page-title">
            {t('games.title')}
          </h1>
          <p className="page-subtitle">
            {t('games.selectBody')}
          </p>
        </div>
        <button type="button" className="btn btn-primary games-create-btn" onClick={() => {
          setSetupDefaults(null)
          setShowSetup(true)
        }}>
          {t('games.create')}
        </button>
      </div>

      {sessions.length === 0 && (
        <PageState
          title={t('games.emptyTitle')}
          body={t('games.emptyBody')}
          actionLabel={t('games.create')}
          onAction={() => {
            setSetupDefaults(null)
            setShowSetup(true)
          }}
        />
      )}

      {activeSessions.length > 0 && (
        <section className="games-section" aria-labelledby="active-games-title">
          <div id="active-games-title" className="summary-title">{t('games.activeTitle')}</div>
          <div className="games-grid">
            {activeSessions.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                locale={locale}
                onOpen={() => navigate(gamePath(session.id))}
                onManage={() => setManagingSession(session)}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {otherSessions.length > 0 && (
        <section className="games-section" aria-labelledby="past-games-title">
          <div id="past-games-title" className="summary-title">{t('games.pastTitle')}</div>
          <div className="games-grid">
            {otherSessions.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                locale={locale}
                onOpen={() => navigate(gamePath(session.id))}
                onManage={() => setManagingSession(session)}
                t={t}
              />
            ))}
          </div>
        </section>
      )}

      {showSetup && (
        <CreateGameModal
          t={t}
          initialSetup={setupDefaults}
          onClose={() => {
            setShowSetup(false)
            setSetupDefaults(null)
          }}
          onCreate={(payload) => createSessionMutation.mutateAsync(payload)}
          onCreated={handleCreated}
        />
      )}

      {managingSession && (
        <GameManagementModal
          session={managingSession}
          locale={locale}
          t={t}
          onClose={() => setManagingSession(null)}
          onSave={(sessionId, updates) => updateSessionMutation.mutateAsync({ sessionId, updates })}
          onUpdated={handleUpdated}
          onRequestDelete={(session) => {
            setManagingSession(null)
            setDeletingSession(session)
          }}
          onRequestArchive={(session) => {
            setManagingSession(null)
            setArchivingSession(session)
          }}
        />
      )}

      {deletingSession && (
        <DeleteGameModal
          session={deletingSession}
          t={t}
          onClose={() => setDeletingSession(null)}
          onDelete={(sessionId) => deleteSessionMutation.mutateAsync(sessionId)}
          onDeleted={handleDeleted}
        />
      )}

      {archivingSession && (
        <ArchiveGameModal
          session={archivingSession}
          t={t}
          onClose={() => setArchivingSession(null)}
          onArchive={(sessionId, updates) => updateSessionMutation.mutateAsync({ sessionId, updates })}
          onArchived={(updatedSession) => {
            setArchivingSession(null)
            handleUpdated(updatedSession)
          }}
        />
      )}
    </div>
  )
}

export default Games
