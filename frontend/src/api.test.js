import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, apiFetchOrThrow } from './api'

vi.mock('./i18n', () => ({
  default: { t: (key) => key },
}))

describe('throwing API requests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([false, true])('only clears the token that received a 401 (replacement: %s)', async (replaced) => {
    let token = 'request-token'
    const removeItem = vi.fn(() => { token = null })
    vi.stubGlobal('localStorage', { getItem: () => token, removeItem })
    vi.stubGlobal('window', { location: { href: '/games' } })
    let finishRequest
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finishRequest = resolve })))
    const request = apiFetch('/game/sessions/42')
    if (replaced) token = 'replacement-token'
    finishRequest({ status: 401, ok: false })
    await expect(request).resolves.toBeNull()
    if (replaced) {
      expect(token).toBe('replacement-token')
      expect(removeItem).not.toHaveBeenCalled()
      expect(window.location.href).toBe('/games')
    } else {
      expect(token).toBeNull()
      expect(removeItem).toHaveBeenCalledOnce()
      expect(window.location.href).toBe('/login')
    }
  })

  it('rejects with the backend message and retry metadata', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ detail: 'Session not found' }),
    }))

    await expect(apiFetchOrThrow('/game/sessions/42')).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: 'Session not found',
      status: 404,
      retryable: false,
    })
  })

  it('keeps callback requests available for unmigrated screens', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ detail: 'Invalid request' }),
    }))
    const onError = vi.fn()

    await expect(apiFetch('/stock/UNKNOWN', {}, onError)).resolves.toBeNull()

    expect(onError).toHaveBeenCalledWith('Invalid request', {
      status: 400,
      retryable: false,
    })
  })

  it('localizes authentication throttling and marks it retryable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({
        detail: 'Too many authentication attempts. Try again later.',
      }),
    }))
    const onError = vi.fn()

    await expect(apiFetch('/auth/login', {}, onError)).resolves.toBeNull()

    expect(onError).toHaveBeenCalledWith('auth.rateLimited', {
      status: 429,
      retryable: true,
    })
  })

  it('keeps a failed public login independent of a stale stored token', async () => {
    const removeItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => 'stale-token', removeItem })
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401,
      json: async () => ({ detail: 'Invalid username or password' }) })
    vi.stubGlobal('fetch', fetch)
    const error = vi.fn()
    await apiFetch('/auth/login', {}, error)
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(error).toHaveBeenCalledWith('auth.invalidCredentials', { status: 401, retryable: false })
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('logs response paths as structured data instead of format strings', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      removeItem: vi.fn(),
    })
    const data = { detail: 'Upstream unavailable' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue(data),
    }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const path = '/stock/%s%s'

    await expect(apiFetch(path)).resolves.toBeNull()

    expect(consoleError).toHaveBeenCalledWith('API response error', {
      path,
      status: 503,
      data,
    })
  })

  it('logs network errors without using the request path as a format string', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      removeItem: vi.fn(),
    })
    const error = new Error('offline')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const path = '/stock/%c%s'

    await expect(apiFetch(path)).resolves.toBeNull()

    expect(consoleError).toHaveBeenCalledWith('API error', { path, error })
  })
})
