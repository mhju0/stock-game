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
})
