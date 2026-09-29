import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ko from './ko.json'
import en from './en.json'

// Keep <html lang> in sync so :lang(ko) line-breaking rules and screen readers follow the UI language.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: localStorage.getItem('lang') || 'ko',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n