import { describe, expect, it } from 'vitest'
import { formatMoney } from './formatters'

describe('formatMoney', () => {
  it('groups USD thousands and keeps two decimals', () => {
    expect(formatMoney(3703.8888, 'USD')).toBe('$3,703.89')
    expect(formatMoney(185, 'USD')).toBe('$185.00')
  })

  it('groups KRW thousands without decimals', () => {
    expect(formatMoney(10_250_000.4, 'KRW')).toBe('₩10,250,000')
  })

  it('places a loss sign before the currency symbol', () => {
    expect(formatMoney(-110_000, 'KRW')).toBe('-₩110,000')
    expect(formatMoney(-111_000.25, 'USD')).toBe('-$111,000.25')
    expect(formatMoney(-0.001, 'USD')).toBe('$0.00')
  })

  it('preserves the existing Intl rounding at decimal boundaries', () => {
    expect(formatMoney(1.005, 'USD')).toBe('$1.01')
    expect(formatMoney(-1.005, 'USD')).toBe('-$1.01')
  })
})
