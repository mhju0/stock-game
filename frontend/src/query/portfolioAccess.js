import { createContext, useContext } from 'react'

export const PortfolioAccessContext = createContext(null)

const RESOURCE_PATHS = {
  account: 'portfolio/account',
  holdings: 'portfolio/holdings',
  transactions: 'portfolio/transactions',
  performance: 'analytics/performance',
  'by-stock': 'analytics/by-stock',
  'by-sector': 'analytics/by-sector',
  realized: 'analytics/realized',
}

function userKey(userId) {
  return userId == null ? 'anonymous' : String(userId)
}

function resourcePath(resource) {
  const path = RESOURCE_PATHS[resource]
  if (!path) throw new Error(`Unknown Portfolio resource: ${resource}`)
  return path
}

function createPortfolioAccess(kind, userId, sessionId = null) {
  if (kind === 'session' && (sessionId == null || sessionId === '')) {
    throw new Error('Session Portfolio requires a Game Session ID')
  }

  const root = ['session-data', userKey(userId)]
  const scope = kind === 'session'
    ? [...root, 'session', String(sessionId)]
    : [...root, 'legacy']

  const queryKey = (resource) => [
    ...scope,
    ...resourcePath(resource).split('/'),
  ]
  const lifecycleKey = (resource) => [...scope, resource]

  return Object.freeze({
    kind,
    userId,
    sessionId,
    scope,
    queryKey,
    readPath(resource) {
      const path = resourcePath(resource)
      return kind === 'session'
        ? `/game/sessions/${sessionId}/${path}`
        : `/${path}`
    },
    tradePath(type) {
      if (!['buy', 'sell', 'exchange'].includes(type)) {
        throw new Error(`Unknown Portfolio trade: ${type}`)
      }
      if (kind === 'session') return `/game/sessions/${sessionId}/trade/${type}`
      if (type === 'exchange') return '/trade/exchange'
      return `/trade/${type}?user_id=${userId}`
    },
    tradeImpact() {
      return {
        exact: [
          queryKey('account'),
          queryKey('holdings'),
          queryKey('transactions'),
          queryKey('performance'),
          queryKey('by-stock'),
          queryKey('by-sector'),
          queryKey('realized'),
          lifecycleKey('detail'),
          lifecycleKey('status'),
          lifecycleKey('summary'),
          lifecycleKey('result'),
        ],
        prefixes: [[...root, 'lists']],
      }
    },
  })
}

export function createSessionPortfolioAccess(userId, sessionId) {
  return createPortfolioAccess('session', userId, sessionId)
}

export function createLegacyPortfolioAccess(userId) {
  return createPortfolioAccess('legacy', userId)
}

export function compatibilityPortfolioAccess(userId, sessionId) {
  return sessionId == null
    ? createLegacyPortfolioAccess(userId)
    : createSessionPortfolioAccess(userId, sessionId)
}

export function usePortfolioAccess() {
  const access = useContext(PortfolioAccessContext)
  if (!access) {
    throw new Error('Portfolio query requires an explicit Portfolio scope')
  }
  return access
}
