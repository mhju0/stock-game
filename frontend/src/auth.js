import { jwtDecode } from 'jwt-decode'

const TOKEN_KEY = 'stockGameToken'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)

export const removeToken = () => localStorage.removeItem(TOKEN_KEY)

export const isAuthenticated = () => !!getToken()

export const getCurrentUserId = () => {
  const token = getToken()
  if (!token) return null
  try {
    const decoded = jwtDecode(token)
    return parseInt(decoded.sub) || null
  } catch {
    return null
  }
}
