import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveGameSessionScreen,
  useGameSessionLifecycle,
} from './useGameSessionLifecycle'

const queryMocks = vi.hoisted(() => ({
  performance: vi.fn(),
  result: vi.fn(),
  status: vi.fn(),
  summary: vi.fn(),
}))

vi.mock('../query/queries', () => ({
  useAnalyticsPerformanceQuery: queryMocks.performance,
  useSessionResultQuery: queryMocks.result,
  useSessionStatusQuery: queryMocks.status,
  useSessionSummaryQuery: queryMocks.summary,
}))

function queryResult(data, overrides = {}) {
  return {
    data,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('Game Session lifecycle controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryMocks.status.mockReturnValue(queryResult({ status: 'active' }))
    queryMocks.summary.mockReturnValue(queryResult({ total_return: 10 }))
    queryMocks.result.mockReturnValue(queryResult(null))
    queryMocks.performance.mockReturnValue(queryResult({ snapshots: [] }))
  })

  afterEach(() => cleanup())

  it('requests lifecycle resources eagerly and enables performance only while active', () => {
    const { result } = renderHook(() => useGameSessionLifecycle(7, 42))

    expect(queryMocks.status).toHaveBeenCalledWith(7, 42)
    expect(queryMocks.summary).toHaveBeenCalledWith(7, 42)
    expect(queryMocks.result).toHaveBeenCalledWith(7, 42)
    expect(queryMocks.performance).toHaveBeenCalledWith({ enabled: true })
    expect(result.current.screen).toBe('active-overview')

    act(() => result.current.actions.refresh())

    expect(queryMocks.status.mock.results[0].value.refetch).toHaveBeenCalledOnce()
    expect(queryMocks.summary.mock.results[0].value.refetch).toHaveBeenCalledOnce()
    expect(queryMocks.result.mock.results[0].value.refetch).toHaveBeenCalledOnce()
    expect(queryMocks.performance.mock.results[0].value.refetch).toHaveBeenCalledOnce()

    act(() => result.current.actions.openSummary())

    expect(result.current.screen).toBe('active-summary')
  })

  it('keeps ended Sessions on saved results and skips performance refreshes', () => {
    const statusQuery = queryResult({ status: 'completed' })
    const summaryQuery = queryResult({ total_return: 10 })
    const resultQuery = queryResult({ result_data_available: true })
    const performanceQuery = queryResult(undefined)
    queryMocks.status.mockReturnValue(statusQuery)
    queryMocks.summary.mockReturnValue(summaryQuery)
    queryMocks.result.mockReturnValue(resultQuery)
    queryMocks.performance.mockReturnValue(performanceQuery)

    const { result } = renderHook(() => useGameSessionLifecycle(7, 42))

    expect(queryMocks.performance).toHaveBeenCalledWith({ enabled: false })
    expect(result.current.screen).toBe('ended-result')

    act(() => result.current.actions.refresh())

    expect(statusQuery.refetch).toHaveBeenCalledOnce()
    expect(summaryQuery.refetch).toHaveBeenCalledOnce()
    expect(resultQuery.refetch).toHaveBeenCalledOnce()
    expect(performanceQuery.refetch).not.toHaveBeenCalled()
  })

  it('preserves the existing screen priority', () => {
    expect(resolveGameSessionScreen({ loading: true })).toBe('loading')
    expect(resolveGameSessionScreen({ status: null })).toBe('status-error')
    expect(resolveGameSessionScreen({
      status: { status: 'active' },
      showSummary: true,
      summaryError: true,
    })).toBe('summary-error')
    expect(resolveGameSessionScreen({
      status: { status: 'completed' },
      result: null,
    })).toBe('ended-result-error')
    expect(resolveGameSessionScreen({
      status: { status: 'completed' },
      result: { result_data_available: false },
    })).toBe('ended-result')
    expect(resolveGameSessionScreen({
      status: { status: 'active' },
      showSummary: true,
      summary: { total_return: 10 },
    })).toBe('active-summary')
    expect(resolveGameSessionScreen({
      status: { status: 'active' },
    })).toBe('active-overview')
  })
})
