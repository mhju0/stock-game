import { useTranslation } from 'react-i18next'
import ThemeToggle from './ThemeToggle'

const FEATURE_KEYS = [
  ['showcaseGameTitle', 'showcaseGameBody'],
  ['showcaseBenchmarkTitle', 'showcaseBenchmarkBody'],
  ['showcaseReviewTitle', 'showcaseReviewBody'],
]

function BrandMark() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M21 7v5M16 7h5" />
      </svg>
    </span>
  )
}

function AuthShell({ title, subtitle, children, footer }) {
  const { t, i18n } = useTranslation()
  const isKo = i18n.language === 'ko'

  const toggleLanguage = () => {
    const next = isKo ? 'en' : 'ko'
    localStorage.setItem('lang', next)
    i18n.changeLanguage(next)
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="auth-story-title">
        <div className="auth-story-brand">
          <BrandMark />
          <span>{t('common.appName')}</span>
        </div>

        <div className="auth-story-copy">
          <div className="page-eyebrow">{t('auth.showcaseEyebrow')}</div>
          <h1 id="auth-story-title">{t('auth.showcaseTitle')}</h1>
          <p className="auth-story-kicker">{t('auth.showcaseKicker')}</p>
          <p className="auth-story-body">{t('auth.showcaseBody')}</p>
        </div>

        <div className="auth-feature-list">
          {FEATURE_KEYS.map(([titleKey, bodyKey], index) => (
            <div className="auth-feature" key={titleKey}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{t(`auth.${titleKey}`)}</strong>
                <p>{t(`auth.${bodyKey}`)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-panel-title">
        <div className="auth-panel-tools">
          <ThemeToggle compact />
          <button type="button" className="lang-toggle" onClick={toggleLanguage}>
            {isKo ? 'EN' : '한국어'}
          </button>
        </div>

        <div className="auth-panel-content">
          <div className="auth-mobile-brand">
            <BrandMark />
            <span>{t('common.appName')}</span>
          </div>
          <div className="auth-panel-heading">
            <h2 id="auth-panel-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
          {footer}
        </div>
      </section>
    </main>
  )
}

export default AuthShell
