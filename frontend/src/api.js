import { API } from './config'
import { getToken, removeToken } from './auth'
import i18n from './i18n'

function getConnectionErrorMessage() {
  return i18n.t('common.connectionError')
}

function getResponseErrorMessage(data, status) {
  if (typeof data.detail === 'string') return data.detail
  if (typeof data.error === 'string') return data.error
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return data.detail
      .map((item) => item?.msg)
      .filter(Boolean)
      .join(' ')
  }
  if (status >= 500) return i18n.t('common.serverError')
  return `Request failed (${status})`
}

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
      const message = getResponseErrorMessage(data, res.status)
      if (import.meta.env.DEV) {
        console.error(`API response error [${path}]`, { status: res.status, data })
      }
      if (onError) onError(message)
      return null
    }

    return await res.json()
  } catch (err) {
    const message = getConnectionErrorMessage()
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

export async function apiPatch(path, body, onError = null) {
  return apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, onError)
}

export async function apiDelete(path, onError = null) {
  return apiFetch(path, { method: 'DELETE' }, onError)
}
