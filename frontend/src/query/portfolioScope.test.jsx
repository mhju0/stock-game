import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LegacyPortfolioScope,
  SessionPortfolioScope,
} from './portfolioScope'
import { usePortfolioAccess } from './portfolioAccess'

describe('Portfolio scopes', () => {
  afterEach(() => cleanup())

  it('binds Session Portfolio paths, cache identity, and trade impact', () => {
    const wrapper = ({ children }) => (
      <SessionPortfolioScope userId={7} sessionId={42}>
        {children}
      </SessionPortfolioScope>
    )
    const { result } = renderHook(() => usePortfolioAccess(), { wrapper })

    expect(result.current.readPath('account')).toBe(
      '/game/sessions/42/portfolio/account',
    )
    expect(result.current.tradePath('buy')).toBe(
      '/game/sessions/42/trade/buy',
    )
    expect(result.current.queryKey('holdings')).toEqual([
      'session-data',
      '7',
      'session',
      '42',
      'portfolio',
      'holdings',
    ])
    expect(result.current.tradeImpact().prefixes).toEqual([
      ['session-data', '7', 'lists'],
    ])
  })

  it('requires an explicit Legacy Portfolio scope for compatibility paths', () => {
    const wrapper = ({ children }) => (
      <LegacyPortfolioScope userId="7">
        {children}
      </LegacyPortfolioScope>
    )
    const { result } = renderHook(() => usePortfolioAccess(), { wrapper })

    expect(result.current.readPath('holdings')).toBe('/portfolio/holdings')
    expect(result.current.tradePath('sell')).toBe('/trade/sell?user_id=7')
    expect(result.current.queryKey('holdings')).toEqual([
      'session-data',
      '7',
      'legacy',
      'portfolio',
      'holdings',
    ])
  })

  it('fails closed when no Portfolio scope is mounted', () => {
    expect(() => renderHook(() => usePortfolioAccess())).toThrow(
      'Portfolio query requires an explicit Portfolio scope',
    )
  })
})
