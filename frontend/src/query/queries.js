import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiFetchOrThrow, apiDelete } from '../api'

function userKey(userId) {
  return userId == null ? 'anonymous' : String(userId)
}

function sessionScope(userId, sessionId) {
  const root = ['session-data', userKey(userId)]
  return sessionId == null
    ? [...root, 'legacy']
    : [...root, 'session', String(sessionId)]
}

const queryDefaults = {
  staleTime: 30000,
  retry: (failureCount, error) => Boolean(error?.retryable) && failureCount < 2,
  retryDelay: 2000,
}

export const sessionQueryKeys = {
  all: (userId) => ['session-data', userKey(userId)],
  lists: (userId) => [...sessionQueryKeys.all(userId), 'lists'],
  list: (userId, includeAll = false) => [
    ...sessionQueryKeys.lists(userId),
    includeAll ? 'all' : 'active',
  ],
  detail: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'detail',
  ],
  status: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'status',
  ],
  summary: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'summary',
  ],
  result: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'result',
  ],
  account: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'portfolio',
    'account',
  ],
  holdings: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'portfolio',
    'holdings',
  ],
  transactions: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'portfolio',
    'transactions',
  ],
  analytics: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'analytics',
  ],
  analyticsPerformance: (userId, sessionId) => [
    ...sessionQueryKeys.analytics(userId, sessionId),
    'performance',
  ],
  analyticsByStock: (userId, sessionId) => [
    ...sessionQueryKeys.analytics(userId, sessionId),
    'by-stock',
  ],
  analyticsBySector: (userId, sessionId) => [
    ...sessionQueryKeys.analytics(userId, sessionId),
    'by-sector',
  ],
  analyticsRealized: (userId, sessionId) => [
    ...sessionQueryKeys.analytics(userId, sessionId),
    'realized',
  ],
}

export const queryKeys = {
  account: sessionQueryKeys.account,
  holdings: sessionQueryKeys.holdings,
  watchlist: (userId) => ['watchlist', userId],
  watchlistContains: (userId, ticker) => ['watchlist-contains', userId, ticker],
  analyticsPerformance: sessionQueryKeys.analyticsPerformance,
}

function jsonRequest(path, method, body) {
  return apiFetchOrThrow(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function tradePath(userId, sessionId, type) {
  if (sessionId != null) return `/game/sessions/${sessionId}/trade/${type}`
  if (type === 'exchange') return '/trade/exchange'
  return `/trade/${type}?user_id=${userId}`
}

function analyticsPath(sessionId, section) {
  return sessionId != null
    ? `/game/sessions/${sessionId}/analytics/${section}`
    : `/analytics/${section}`
}

function invalidateTradeData(queryClient, userId, sessionId) {
  const exactKeys = [
    sessionQueryKeys.account(userId, sessionId),
    sessionQueryKeys.holdings(userId, sessionId),
    sessionQueryKeys.transactions(userId, sessionId),
    sessionQueryKeys.analyticsPerformance(userId, sessionId),
    sessionQueryKeys.analyticsByStock(userId, sessionId),
    sessionQueryKeys.analyticsBySector(userId, sessionId),
    sessionQueryKeys.analyticsRealized(userId, sessionId),
    sessionQueryKeys.detail(userId, sessionId),
    sessionQueryKeys.status(userId, sessionId),
    sessionQueryKeys.summary(userId, sessionId),
    sessionQueryKeys.result(userId, sessionId),
  ]

  for (const queryKey of exactKeys) {
    queryClient.invalidateQueries({ queryKey, exact: true })
  }
  queryClient.invalidateQueries({ queryKey: sessionQueryKeys.lists(userId) })
}

function updateSessionList(current, updatedSession, includeAll) {
  if (!Array.isArray(current?.sessions)) return current
  const sessionIndex = current.sessions.findIndex(
    (session) => String(session.id) === String(updatedSession.id),
  )
  const belongsInList = includeAll || updatedSession.status === 'active'

  if (!belongsInList) {
    return {
      ...current,
      sessions: current.sessions.filter(
        (session) => String(session.id) !== String(updatedSession.id),
      ),
    }
  }

  if (sessionIndex < 0) {
    return { ...current, sessions: [updatedSession, ...current.sessions] }
  }

  return {
    ...current,
    sessions: current.sessions.map((session, index) => (
      index === sessionIndex ? updatedSession : session
    )),
  }
}

export function useSessionListQuery(userId, { includeAll = false } = {}) {
  return useQuery({
    queryKey: sessionQueryKeys.list(userId, includeAll),
    queryFn: () => apiFetchOrThrow(
      includeAll ? '/game/sessions?include_all=true' : '/game/sessions',
    ),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useSessionDetailQuery(userId, sessionId) {
  return useQuery({
    queryKey: sessionQueryKeys.detail(userId, sessionId),
    queryFn: () => apiFetchOrThrow(`/game/sessions/${sessionId}`),
    enabled: !!userId && sessionId != null,
    ...queryDefaults,
  })
}

function useSessionResourceQuery(userId, sessionId, resource, queryKey) {
  return useQuery({
    queryKey,
    queryFn: () => apiFetchOrThrow(`/game/sessions/${sessionId}/${resource}`),
    enabled: !!userId && sessionId != null,
    ...queryDefaults,
  })
}

export function useSessionStatusQuery(userId, sessionId) {
  return useSessionResourceQuery(
    userId,
    sessionId,
    'status',
    sessionQueryKeys.status(userId, sessionId),
  )
}

export function useSessionSummaryQuery(userId, sessionId) {
  return useSessionResourceQuery(
    userId,
    sessionId,
    'summary',
    sessionQueryKeys.summary(userId, sessionId),
  )
}

export function useSessionResultQuery(userId, sessionId) {
  return useSessionResourceQuery(
    userId,
    sessionId,
    'result',
    sessionQueryKeys.result(userId, sessionId),
  )
}

export function useAccountQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: queryKeys.account(userId, sessionId),
    queryFn: () => apiFetchOrThrow(
      sessionId
        ? `/game/sessions/${sessionId}/portfolio/account`
        : '/portfolio/account'
    ),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useHoldingsQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: queryKeys.holdings(userId, sessionId),
    queryFn: () => apiFetchOrThrow(
      sessionId
        ? `/game/sessions/${sessionId}/portfolio/holdings`
        : '/portfolio/holdings'
    ),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useTransactionsQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: sessionQueryKeys.transactions(userId, sessionId),
    queryFn: () => apiFetchOrThrow(
      sessionId != null
        ? `/game/sessions/${sessionId}/portfolio/transactions`
        : '/portfolio/transactions',
    ),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useWatchlistQuery(userId) {
  return useQuery({
    queryKey: queryKeys.watchlist(userId),
    queryFn: () => apiFetchOrThrow('/watchlist/'),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useAnalyticsPerformanceQuery(
  userId,
  sessionId = null,
  { enabled = true } = {},
) {
  return useQuery({
    queryKey: queryKeys.analyticsPerformance(userId, sessionId),
    queryFn: () => apiFetchOrThrow(
      sessionId
        ? `/game/sessions/${sessionId}/analytics/performance`
        : '/analytics/performance'
    ),
    enabled: !!userId && enabled,
    ...queryDefaults,
  })
}

export function useAnalyticsByStockQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: sessionQueryKeys.analyticsByStock(userId, sessionId),
    queryFn: () => apiFetchOrThrow(analyticsPath(sessionId, 'by-stock')),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useAnalyticsBySectorQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: sessionQueryKeys.analyticsBySector(userId, sessionId),
    queryFn: () => apiFetchOrThrow(analyticsPath(sessionId, 'by-sector')),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useAnalyticsRealizedQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: sessionQueryKeys.analyticsRealized(userId, sessionId),
    queryFn: () => apiFetchOrThrow(analyticsPath(sessionId, 'realized')),
    enabled: !!userId,
    ...queryDefaults,
  })
}

export function useWatchlistContainsQuery(userId, ticker) {
  return useQuery({
    queryKey: queryKeys.watchlistContains(userId, ticker),
    queryFn: () => apiFetchOrThrow(`/watchlist/contains?ticker=${ticker}`),
    enabled: !!userId && !!ticker,
    ...queryDefaults,
  })
}

export function useWatchlistToggleMutation(userId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ticker, isInWatchlist }) => {
      if (isInWatchlist) {
        const res = await apiDelete(`/watchlist/remove/${ticker}`)
        if (!res) throw new Error('remove failed')
        return res
      }
      const res = await apiFetch(`/watchlist/add?ticker=${ticker}`, { method: 'POST' })
      if (!res) throw new Error('add failed')
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(userId) })
      queryClient.invalidateQueries({ queryKey: ['watchlist-contains', userId] })
    },
  })
}

export function useCreateSessionMutation(userId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload) => jsonRequest('/game/sessions', 'POST', payload),
    onSuccess: (data) => {
      if (data?.session?.id != null) {
        queryClient.setQueryData(
          sessionQueryKeys.detail(userId, data.session.id),
          { session: data.session },
        )
      }
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.lists(userId) })
    },
  })
}

export function useUpdateSessionMutation(userId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ sessionId, updates }) => jsonRequest(
      `/game/sessions/${sessionId}`,
      'PATCH',
      updates,
    ),
    onSuccess: (data, { sessionId }) => {
      if (data?.session) {
        queryClient.setQueryData(
          sessionQueryKeys.detail(userId, sessionId),
          { session: data.session },
        )
        for (const includeAll of [false, true]) {
          queryClient.setQueryData(
            sessionQueryKeys.list(userId, includeAll),
            (current) => updateSessionList(current, data.session, includeAll),
          )
        }
      }

      for (const queryKey of [
        sessionQueryKeys.status(userId, sessionId),
        sessionQueryKeys.summary(userId, sessionId),
        sessionQueryKeys.result(userId, sessionId),
      ]) {
        queryClient.invalidateQueries({ queryKey, exact: true })
      }
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.lists(userId) })
    },
  })
}

export function useDeleteSessionMutation(userId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId) => apiFetchOrThrow(
      `/game/sessions/${sessionId}`,
      { method: 'DELETE' },
    ),
    onSuccess: (_data, sessionId) => {
      queryClient.removeQueries({ queryKey: sessionScope(userId, sessionId) })
      queryClient.setQueriesData(
        { queryKey: sessionQueryKeys.lists(userId) },
        (current) => {
          if (!Array.isArray(current?.sessions)) return current
          return {
            ...current,
            sessions: current.sessions.filter(
              (session) => String(session.id) !== String(sessionId),
            ),
          }
        },
      )
      queryClient.invalidateQueries({ queryKey: sessionQueryKeys.lists(userId) })
    },
  })
}

export function useTradeMutation(userId, sessionId = null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ type, payload }) => jsonRequest(
      tradePath(userId, sessionId, type),
      'POST',
      payload,
    ),
    onSuccess: (data) => {
      if (data?.balance) {
        queryClient.setQueryData(
          sessionQueryKeys.account(userId, sessionId),
          (current) => ({
            ...(current || {}),
            balance_krw: data.balance.krw,
            balance_usd: data.balance.usd,
          }),
        )
      }
      invalidateTradeData(queryClient, userId, sessionId)
    },
  })
}
