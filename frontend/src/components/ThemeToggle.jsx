import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const THEME_KEY = 'stockGameTheme'
const THEME_EVENT = 'stock-game-theme-change'

function currentTheme() {
  const appliedTheme = document.documentElement.dataset.theme
  if (appliedTheme === 'light' || appliedTheme === 'dark') return appliedTheme

  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // The selected theme still applies for this page when storage is blocked.
  }
}

function ThemeGlyph({ theme }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === 'dark' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
        </>
      ) : (
        <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" />
      )}
    </svg>
  )
}

function ThemeToggle({ compact = false }) {
  const { t } = useTranslation()
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    applyTheme(theme)

    const syncTheme = (event) => setTheme(event.detail)
    window.addEventListener(THEME_EVENT, syncTheme)
    return () => window.removeEventListener(THEME_EVENT, syncTheme)
  }, [theme])

  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    applyTheme(nextTheme)
    setTheme(nextTheme)
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: nextTheme }))
  }

  return (
    <button
      type="button"
      className={`theme-toggle ${compact ? 'theme-toggle-compact' : ''}`}
      onClick={toggle}
      aria-label={theme === 'dark' ? t('common.useLightTheme') : t('common.useDarkTheme')}
    >
      <ThemeGlyph theme={theme} />
      {!compact && (
        <span>{theme === 'dark' ? t('common.lightTheme') : t('common.darkTheme')}</span>
      )}
    </button>
  )
}

export default ThemeToggle
