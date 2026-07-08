import { API } from './config'
import { getToken, removeToken } from './auth'

export async function apiFetch(path, options = {}, onError = null) {
  try {
    const headers = { ...options.headers }
    const token = getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API}${path}`, { ...options, headers })

    if (res.status === 401 && token) {
      removeToken()
      window.location.href = '/login'
      return null
    }

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

export function apiGet(path, setter, onError = null) {
  apiFetch(path, {}, onError).then(data => {
    if (data !== null) setter(data)
  })
}

export async function apiPost(path, body, onError = null) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, onError)
}

export async function apiDelete(path, onError = null) {
  return apiFetch(path, { method: 'DELETE' }, onError)
}
