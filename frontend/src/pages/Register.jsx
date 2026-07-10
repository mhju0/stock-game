import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiPost } from '../api'
import { setToken } from '../auth'

function Register() {
  const { t, i18n } = useTranslation()
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
    if (password.length < 4) {
      setError(t('auth.passwordTooShort'))
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

  const isKo = i18n.language === 'ko'

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: '0 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
      <div style={{ position: 'fixed', top: 24, right: 24 }}>
        <button className="lang-toggle" onClick={() => {
          const next = isKo ? 'en' : 'ko'
          localStorage.setItem('lang', next)
          i18n.changeLanguage(next)
        }}>
          {isKo ? 'EN' : '한국어'}
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--prism-blue), var(--prism-violet), var(--prism-pink))',
          margin: '0 auto 16px', opacity: 0.85,
          boxShadow: '0 8px 40px rgba(96, 165, 250, 0.2), 0 0 80px rgba(167, 139, 250, 0.1)',
        }} />
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
          letterSpacing: -0.5, marginBottom: 6,
        }}>
          {t('common.appName')}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontSize: 15 }}>
          {t('auth.registerTitle')}
        </p>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="register-username" style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              {t('auth.username')}
            </label>
            <input id="register-username" className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth.username')} autoFocus style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label htmlFor="register-password" style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              {t('auth.password')}
            </label>
            <input id="register-password" className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password')} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label htmlFor="register-confirm-password" style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              {t('auth.confirmPassword')}
            </label>
            <input id="register-confirm-password" className="input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('auth.confirmPassword')} style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>

          {error && <p style={{ color: 'var(--negative)', fontSize: 13, fontFamily: 'var(--font-display)', margin: 0 }}>{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '12px 0', borderRadius: 14, fontSize: 15, fontWeight: 600, marginTop: 4 }}>
            {loading ? t('common.loading') : t('auth.register')}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text-secondary)' }}>
          {t('auth.hasAccount')}{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            {t('auth.login')}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Register
