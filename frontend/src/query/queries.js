import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiDelete } from '../api'

export const queryKeys = {
  account: (userId) => ['account', userId],
  holdings: (userId) => ['holdings', userId],
  watchlist: (userId) => ['watchlist', userId],
  watchlistContains: (userId, ticker) => ['watchlist-contains', userId, ticker],
  analyticsPerformance: (userId) => ['analytics-performance', userId],
}

export function useAccountQuery(userId) {
  return useQuery({
    queryKey: queryKeys.account(userId),
    queryFn: () => apiFetch(`/portfolio/account?user_id=${userId}`),
    enabled: !!userId,
    staleTime: 15000,
  })
}

export function useHoldingsQuery(userId) {
  return useQuery({
    queryKey: queryKeys.holdings(userId),
    queryFn: () => apiFetch(`/portfolio/holdings?user_id=${userId}`),
    enabled: !!userId,
    staleTime: 15000,
  })
}

export function useWatchlistQuery(userId) {
  return useQuery({
    queryKey: queryKeys.watchlist(userId),
    queryFn: () => apiFetch(`/watchlist/?user_id=${userId}`),
    enabled: !!userId,
    staleTime: 15000,
  })
}

export function useAnalyticsPerformanceQuery(userId) {
  return useQuery({
    queryKey: queryKeys.analyticsPerformance(userId),
    queryFn: () => apiFetch(`/analytics/performance?user_id=${userId}`),
    enabled: !!userId,
    staleTime: 20000,
  })
}

export function useWatchlistContainsQuery(userId, ticker) {
  return useQuery({
    queryKey: queryKeys.watchlistContains(userId, ticker),
    queryFn: () => apiFetch(`/watchlist/contains?ticker=${ticker}&user_id=${userId}`),
    enabled: !!userId && !!ticker,
    staleTime: 15000,
  })
}

export function useWatchlistToggleMutation(userId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ticker, isInWatchlist }) => {
      if (isInWatchlist) {
        const res = await apiDelete(`/watchlist/remove/${ticker}?user_id=${userId}`)
        if (!res) throw new Error('remove failed')
        return res
      }
      const res = await apiFetch(`/watchlist/add?ticker=${ticker}&user_id=${userId}`, { method: 'POST' })
      if (!res) throw new Error('add failed')
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(userId) })
      queryClient.invalidateQueries({ queryKey: ['watchlist-contains', userId] })
    },
  })
}
