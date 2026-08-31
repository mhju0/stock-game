import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiPost } from '../api'
import { setToken } from '../auth'
import { isStrongPassword } from '../utils/passwordPolicy'
import AuthShell from '../components/AuthShell'

function Register() {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password || !confirmPassword) {
      setError(t('auth.fillAllFields'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    if (!isStrongPassword(password)) {
      setError(t('auth.passwordRequirements'))
      return
    }
    setLoading(true)
    const data = await apiPost('/auth/register', { username: username.trim(), password }, setError)
    setLoading(false)
    if (data && data.access_token) {
      setToken(data.access_token)
      window.location.href = '/games'
    }
  }

  return (
    <AuthShell
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={(
        <div className="auth-footer">
          {t('auth.hasAccount')}{' '}
          <Link to="/login">{t('auth.login')}</Link>
        </div>
      )}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <div>
          <label htmlFor="register-username" className="form-label">{t('auth.username')}</label>
          <input id="register-username" className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder={t('auth.username')} autoFocus />
        </div>
        <div>
          <label htmlFor="register-password" className="form-label">{t('auth.password')}</label>
          <input id="register-password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password')} autoComplete="new-password" />
          <p className="form-helper">{t('auth.passwordRequirements')}</p>
        </div>
        <div>
          <label htmlFor="register-confirm-password" className="form-label">{t('auth.confirmPassword')}</label>
          <input id="register-confirm-password" className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('auth.confirmPassword')} autoComplete="new-password" />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
          {loading ? t('common.loading') : t('auth.register')}
        </button>
      </form>
    </AuthShell>
  )
}

export default Register
