import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentUserId, subscribeToTokenChanges } from './auth'

function token(payload) {
  return `${btoa('{}')}.${btoa(JSON.stringify(payload))}.test`
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('client authentication lifecycle', () => {
  it.each(['7abc', '-7', '0', '7.5', '9007199254740992'])('rejects malformed user identity %s', (sub) => {
    vi.stubGlobal('localStorage', { getItem: () => token({ sub, exp: Date.now() / 1000 + 60 }) })
    expect(getCurrentUserId()).toBeNull()
  })

  it.each([undefined, '9999999999', 0, 1000])('rejects missing, malformed or expired expiration %s', (exp) => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    vi.stubGlobal('localStorage', { getItem: () => token({ sub: '7', exp }) })
    expect(getCurrentUserId()).toBeNull()
  })

  it('accepts the authenticated provider shape before expiration', () => {
    vi.stubGlobal('localStorage', { getItem: () => token({ sub: '7', exp: Date.now() / 1000 + 60 }) })
    expect(getCurrentUserId()).toBe(7)
  })

  it.each([null, 'new-account-token'])('reloads the authentication boundary when another tab changes token to %s', (newValue) => {
    const reload = vi.fn()
    const unsubscribe = subscribeToTokenChanges(reload)
    window.dispatchEvent(new StorageEvent('storage', { key: 'stockGameToken', oldValue: 'old-account-token', newValue }))
    expect(reload).toHaveBeenCalledOnce()
    unsubscribe()
    window.dispatchEvent(new StorageEvent('storage', { key: 'stockGameToken', oldValue: 'old-account-token', newValue }))
    expect(reload).toHaveBeenCalledOnce()
  })
})
