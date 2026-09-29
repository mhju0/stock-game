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
})
