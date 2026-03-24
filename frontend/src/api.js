import { API } from './config'

/**
 * Wrapper around fetch that handles errors gracefully.
 * Returns the parsed JSON on success, or null on failure.
 * Optionally calls an onError callback with the error message.
 */
export async function apiFetch(path, options = {}, onError = null) {
  try {
    const res = await fetch(`${API}${path}`, options)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const message = data.detail || data.error || `Request failed (${res.status})`
      if (onError) onError(message)
      return null
    }

    return await res.json()
  } catch (err) {
    const message = 'Cannot connect to server. Is the backend running?'
    if (onError) onError(message)
    console.error(`API error [${path}]:`, err)
    return null
  }
}

/**
 * Fire-and-forget GET that sets state directly.
 * Usage: apiGet('/portfolio/account?user_id=1', setAccount)
 */
export function apiGet(path, setter, onError = null) {
  apiFetch(path, {}, onError).then(data => {
    if (data !== null) setter(data)
  })
}

/**
 * POST helper that returns the parsed response or null.
 * Usage: const data = await apiPost('/trade/buy?user_id=1', { ticker: 'AAPL', quantity: 5 })
 */
export async function apiPost(path, body, onError = null) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, onError)
}

/**
 * DELETE helper.
 */
export async function apiDelete(path, onError = null) {
  return apiFetch(path, { method: 'DELETE' }, onError)
}
