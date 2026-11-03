import { createInstance } from 'i18next'
import { expect, it } from 'vitest'
import en from './en.json'

it('uses singular and plural stock counts in English', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: en } } })
  expect(i18n.t('portfolio.stocksCount', { count: 1 })).toBe('1 stock')
  expect(i18n.t('portfolio.stocksCount', { count: 2 })).toBe('2 stocks')
})
