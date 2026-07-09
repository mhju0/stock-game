import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiDelete } from '../api'

async function apiFetchOrThrow(path) {
  const data = await apiFetch(path)
  if (data === null) throw new Error('API request failed')
  return data
}

export const queryKeys = {
  account: (userId, sessionId) => ['account', userId, sessionId || 'legacy'],
  holdings: (userId, sessionId) => ['holdings', userId, sessionId || 'legacy'],
  watchlist: (userId) => ['watchlist', userId],
  watchlistContains: (userId, ticker) => ['watchlist-contains', userId, ticker],
  analyticsPerformance: (userId, sessionId) => ['analytics-performance', userId, sessionId || 'legacy'],
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
    staleTime: 30000,
    retry: 2,
    retryDelay: 2000,
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
    staleTime: 30000,
    retry: 2,
    retryDelay: 2000,
  })
}

export function useWatchlistQuery(userId) {
  return useQuery({
    queryKey: queryKeys.watchlist(userId),
    queryFn: () => apiFetchOrThrow('/watchlist/'),
    enabled: !!userId,
    staleTime: 30000,
    retry: 2,
    retryDelay: 2000,
  })
}

export function useAnalyticsPerformanceQuery(userId, sessionId = null) {
  return useQuery({
    queryKey: queryKeys.analyticsPerformance(userId, sessionId),
    queryFn: () => apiFetchOrThrow(
      sessionId
        ? `/game/sessions/${sessionId}/analytics/performance`
        : '/analytics/performance'
    ),
    enabled: !!userId,
    staleTime: 30000,
    retry: 2,
    retryDelay: 2000,
  })
}

export function useWatchlistContainsQuery(userId, ticker) {
  return useQuery({
    queryKey: queryKeys.watchlistContains(userId, ticker),
    queryFn: () => apiFetchOrThrow(`/watchlist/contains?ticker=${ticker}`),
    enabled: !!userId && !!ticker,
    staleTime: 30000,
    retry: 2,
    retryDelay: 2000,
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
