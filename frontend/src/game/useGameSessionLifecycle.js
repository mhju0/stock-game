import { useState } from 'react'
import {
  useAnalyticsPerformanceQuery,
  useSessionResultQuery,
  useSessionStatusQuery,
  useSessionSummaryQuery,
} from '../query/queries'

export function resolveGameSessionScreen({
  loading = false,
  result = null,
  showSummary = false,
  status = null,
  summary = null,
  summaryError = false,
}) {
  if (loading) return 'loading'
  if (!status) return 'status-error'
  if (showSummary && summaryError) return 'summary-error'
  if (status.status !== 'active') {
    return result ? 'ended-result' : 'ended-result-error'
  }
  if (showSummary && summary) return 'active-summary'
  return 'active-overview'
}

export function useGameSessionLifecycle(userId, sessionId) {
  const [showSummary, setShowSummary] = useState(false)
  const statusQuery = useSessionStatusQuery(userId, sessionId)
  const summaryQuery = useSessionSummaryQuery(userId, sessionId)
  const resultQuery = useSessionResultQuery(userId, sessionId)
  const status = statusQuery.data || null
  const summary = summaryQuery.data || null
  const result = resultQuery.data || null
  const active = status?.status === 'active'
  const performanceQuery = useAnalyticsPerformanceQuery({ enabled: active })
  const performance = performanceQuery.data
  const primaryQueries = [statusQuery, summaryQuery, resultQuery]
  const loading = primaryQueries.some((query) => (
    query.isLoading || (query.isFetching && query.data === undefined)
  ))
  const performanceLoading = performanceQuery.isLoading || (
    performanceQuery.isFetching && performanceQuery.data === undefined
  )
  const screen = resolveGameSessionScreen({
    loading,
    result,
    showSummary,
    status,
    summary,
    summaryError: summaryQuery.isError,
  })

  const refresh = () => {
    statusQuery.refetch()
    summaryQuery.refetch()
    resultQuery.refetch()
    if (active) performanceQuery.refetch()
  }

  return {
    active,
    errors: {
      performance: performanceQuery.error,
      result: resultQuery.error,
      status: statusQuery.error,
      summary: summaryQuery.error,
    },
    performance,
    performanceError: performanceQuery.isError,
    performanceLoading,
    result,
    screen,
    status,
    summary,
    actions: {
      closeSummary: () => setShowSummary(false),
      openSummary: () => setShowSummary(true),
      refresh,
      retryPerformance: () => performanceQuery.refetch(),
      retrySummary: () => summaryQuery.refetch(),
    },
  }
}
