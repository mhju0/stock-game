import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiFetchOrThrow, apiDelete } from '../api'
import {
  compatibilityPortfolioAccess,
  usePortfolioAccess,
} from './portfolioAccess'

function userKey(userId) {
  return userId == null ? 'anonymous' : String(userId)
}

function sessionScope(userId, sessionId) {
  return compatibilityPortfolioAccess(userId, sessionId).scope
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
    ...compatibilityPortfolioAccess(userId, sessionId).queryKey('account'),
  ],
  holdings: (userId, sessionId) => compatibilityPortfolioAccess(
    userId,
    sessionId,
  ).queryKey('holdings'),
  transactions: (userId, sessionId) => compatibilityPortfolioAccess(
    userId,
    sessionId,
  ).queryKey('transactions'),
  analytics: (userId, sessionId) => [
    ...sessionScope(userId, sessionId),
    'analytics',
  ],
  analyticsPerformance: (userId, sessionId) => [
    ...compatibilityPortfolioAccess(userId, sessionId).queryKey('performance'),
  ],
  analyticsByStock: (userId, sessionId) => [
    ...compatibilityPortfolioAccess(userId, sessionId).queryKey('by-stock'),
  ],
  analyticsBySector: (userId, sessionId) => [
    ...compatibilityPortfolioAccess(userId, sessionId).queryKey('by-sector'),
  ],
  analyticsRealized: (userId, sessionId) => [
    ...compatibilityPortfolioAccess(userId, sessionId).queryKey('realized'),
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

function invalidateTradeData(queryClient, access) {
  const impact = access.tradeImpact()
  for (const queryKey of impact.exact) {
    queryClient.invalidateQueries({ queryKey, exact: true })
  }
  for (const queryKey of impact.prefixes) {
    queryClient.invalidateQueries({ queryKey })
  }
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

export function useAccountQuery() {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('account'),
    queryFn: () => apiFetchOrThrow(access.readPath('account')),
    enabled: !!access.userId,
    ...queryDefaults,
  })
}

export function useHoldingsQuery() {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('holdings'),
    queryFn: () => apiFetchOrThrow(access.readPath('holdings')),
    enabled: !!access.userId,
    ...queryDefaults,
  })
}

export function useTransactionsQuery() {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('transactions'),
    queryFn: () => apiFetchOrThrow(access.readPath('transactions')),
    enabled: !!access.userId,
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
  { enabled = true } = {},
) {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('performance'),
    queryFn: () => apiFetchOrThrow(access.readPath('performance')),
    enabled: !!access.userId && enabled,
    ...queryDefaults,
  })
}

export function useAnalyticsByStockQuery() {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('by-stock'),
    queryFn: () => apiFetchOrThrow(access.readPath('by-stock')),
    enabled: !!access.userId,
    ...queryDefaults,
  })
}

export function useAnalyticsBySectorQuery() {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('by-sector'),
    queryFn: () => apiFetchOrThrow(access.readPath('by-sector')),
    enabled: !!access.userId,
    ...queryDefaults,
  })
}

export function useAnalyticsRealizedQuery() {
  const access = usePortfolioAccess()
  return useQuery({
    queryKey: access.queryKey('realized'),
    queryFn: () => apiFetchOrThrow(access.readPath('realized')),
    enabled: !!access.userId,
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

export function useTradeMutation() {
  const queryClient = useQueryClient()
  const access = usePortfolioAccess()

  return useMutation({
    mutationFn: ({ type, payload }) => jsonRequest(
      access.tradePath(type),
      'POST',
      payload,
    ),
    onSuccess: (data) => {
      if (data?.balance) {
        queryClient.setQueryData(
          access.queryKey('account'),
          (current) => ({
            ...(current || {}),
            balance_krw: data.balance.krw,
            balance_usd: data.balance.usd,
          }),
        )
      }
      invalidateTradeData(queryClient, access)
    },
  })
}
