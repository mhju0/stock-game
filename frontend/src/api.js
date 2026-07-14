import { API } from './config'
import { getToken, removeToken } from './auth'
import i18n from './i18n'

function getConnectionErrorMessage() {
  return i18n.t('common.connectionError')
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500
}

export class ApiRequestError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.retryable = retryable
  }
}

// Matches backend trading_service.py buy/sell insufficiency messages, e.g.
// "Insufficient KRW balance. Need ₩5,000, have ₩3,000"
const INSUFFICIENT_BALANCE_NEED_RE = /^Insufficient (KRW|USD) balance\. Need (₩[\d,]+|\$[\d,.]+), have (₩[\d,]+|\$[\d,.]+)$/
// Matches exchange_currency insufficiency messages, e.g. "Insufficient USD. Have $12.34"
const INSUFFICIENT_BALANCE_HAVE_RE = /^Insufficient (KRW|USD)\. Have (₩[\d,]+|\$[\d,.]+)$/

// Known backend detail strings that read as English-only bugs in the Korean
// UI at high-stakes moments (login/register). Everything else falls back to
// the raw backend detail so unmapped errors are still surfaced, not hidden.
function getResponseErrorMessage(data, status, path) {
  const detail = typeof data.detail === 'string' ? data.detail : null

  if (status === 401 && path === '/auth/login' && detail === 'Invalid username or password') {
    return i18n.t('auth.invalidCredentials')
  }
  if (status === 409 && path === '/auth/register' && detail === 'Username already taken') {
    return i18n.t('auth.usernameTaken')
  }

  if (detail) {
    const needMatch = detail.match(INSUFFICIENT_BALANCE_NEED_RE)
    if (needMatch) {
      return i18n.t('trade.insufficientBalanceNeed', {
        currency: needMatch[1], need: needMatch[2], have: needMatch[3],
      })
    }
    const haveMatch = detail.match(INSUFFICIENT_BALANCE_HAVE_RE)
    if (haveMatch) {
      return i18n.t('trade.insufficientBalanceHave', { currency: haveMatch[1], have: haveMatch[2] })
    }
    return detail
  }

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
      const message = getResponseErrorMessage(data, res.status, path)
      if (import.meta.env.DEV) {
        console.error(`API response error [${path}]`, { status: res.status, data })
      }
      if (onError) {
        onError(message, {
          status: res.status,
          retryable: isRetryableStatus(res.status),
        })
      }
      return null
    }

    return await res.json()
  } catch (err) {
    const message = getConnectionErrorMessage()
    if (onError) onError(message, { status: null, retryable: true })
    console.error(`API error [${path}]:`, err)
    return null
  }
}

export async function apiFetchOrThrow(path, options = {}) {
  let failure = null
  const data = await apiFetch(path, options, (message, metadata = {}) => {
    failure = { message, ...metadata }
  })

  if (data === null) {
    throw new ApiRequestError(
      failure?.message || getConnectionErrorMessage(),
      {
        status: failure?.status ?? null,
        retryable: failure?.retryable ?? false,
      },
    )
  }

  return data
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
