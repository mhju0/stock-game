import { jwtDecode } from 'jwt-decode'

const TOKEN_KEY = 'stockGameToken'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)

export const removeToken = () => localStorage.removeItem(TOKEN_KEY)

export const getCurrentUserId = () => {
  const token = getToken()
  if (!token) return null
  try {
    const decoded = jwtDecode(token)
    if (typeof decoded.sub !== 'string' || !/^[1-9]\d*$/.test(decoded.sub)) return null
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || decoded.exp <= Date.now() / 1000) return null
    const userId = Number(decoded.sub)
    return Number.isSafeInteger(userId) ? userId : null
  } catch {
    return null
  }
}

export const isAuthenticated = () => getCurrentUserId() !== null

export function subscribeToTokenChanges(onChange) {
  const handleStorage = (event) => {
    if (event.key === null || (event.key === TOKEN_KEY && event.oldValue !== event.newValue)) onChange()
  }
  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}
