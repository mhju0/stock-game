import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiPost } from '../api'
import { setToken } from '../auth'
import AuthShell from '../components/AuthShell'

function Login() {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [coldStart, setColdStart] = useState(false)
  const coldStartTimer = useRef(null)

  // Render free tier spins down; the first request can take tens of seconds.
  // After a short delay show a hint so the app doesn't look broken.
  useEffect(() => {
    if (loading) {
      coldStartTimer.current = setTimeout(() => setColdStart(true), 4000)
    } else {
      clearTimeout(coldStartTimer.current)
      setColdStart(false)
    }
    return () => clearTimeout(coldStartTimer.current)
  }, [loading])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError(t('auth.fillAllFields'))
      return
    }
    setLoading(true)
    const data = await apiPost('/auth/login', { username: username.trim(), password }, setError)
    setLoading(false)
    if (data && data.access_token) {
      setToken(data.access_token)
      window.location.href = '/games'
    }
  }

  return (
    <AuthShell
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={(
        <div className="auth-footer">
          {t('auth.noAccount')}{' '}
          <Link to="/register">{t('auth.register')}</Link>
        </div>
      )}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div>
          <label htmlFor="login-username" className="form-label">{t('auth.username')}</label>
          <input id="login-username" className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder={t('auth.username')} autoFocus />
        </div>
        <div>
          <label htmlFor="login-password" className="form-label">{t('auth.password')}</label>
          <input id="login-password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder={t('auth.password')} />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
          {loading ? t('common.loading') : t('auth.login')}
        </button>

        {coldStart && <p className="auth-cold-start" role="status">{t('auth.coldStartHint')}</p>}
      </form>

      <div className="auth-demo-note">
        <span className="status-dot status-dot-active" />
        <span>{t('auth.demoHint')}</span>
      </div>
    </AuthShell>
  )
}

export default Login
