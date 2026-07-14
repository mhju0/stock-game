import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiFetchOrThrow } from '../api'
import {
  sessionQueryKeys,
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useAccountQuery,
  useAnalyticsBySectorQuery,
  useAnalyticsByStockQuery,
  useAnalyticsRealizedQuery,
  useHoldingsQuery,
  useSessionDetailQuery,
  useSessionListQuery,
  useSessionResultQuery,
  useSessionStatusQuery,
  useSessionSummaryQuery,
  useTradeMutation,
  useTransactionsQuery,
  useUpdateSessionMutation,
} from './queries'

vi.mock('../api', () => {
  class MockApiRequestError extends Error {
    constructor(message, { retryable = false } = {}) {
      super(message)
      this.name = 'ApiRequestError'
      this.retryable = retryable
    }
  }

  return {
    ApiRequestError: MockApiRequestError,
    apiFetchOrThrow: vi.fn(),
    apiFetch: vi.fn(),
    apiDelete: vi.fn(),
  }
})

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function createWrapper(queryClient) {
  return function QueryWrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('session data queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('loads a Session Portfolio account through a user/session-scoped key', async () => {
    apiFetchOrThrow.mockResolvedValue({ balance_krw: 1_000_000 })
    const queryClient = createQueryClient()

    const { result } = renderHook(
      () => useAccountQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sessionQueryKeys.account(7, 42)).toEqual([
      'session-data',
      '7',
      'session',
      '42',
      'portfolio',
      'account',
    ])
    expect(apiFetchOrThrow).toHaveBeenCalledWith(
      '/game/sessions/42/portfolio/account',
    )
  })

  it('keeps Legacy Portfolio holdings in a distinct user-scoped cache', async () => {
    apiFetchOrThrow.mockResolvedValue([])
    const queryClient = createQueryClient()

    const { result } = renderHook(
      () => useHoldingsQuery('7'),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sessionQueryKeys.holdings('7')).toEqual([
      'session-data',
      '7',
      'legacy',
      'portfolio',
      'holdings',
    ])
    expect(apiFetchOrThrow).toHaveBeenCalledWith('/portfolio/holdings')
  })

  it('surfaces a non-retryable API message without repeating the request', async () => {
    apiFetchOrThrow.mockRejectedValue(
      new ApiRequestError('Session not found', { retryable: false }),
    )
    const queryClient = createQueryClient()

    const { result } = renderHook(
      () => useAccountQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(
      () => expect(result.current.isError).toBe(true),
      { timeout: 7_000 },
    )

    expect(result.current.error.message).toBe('Session not found')
    expect(apiFetchOrThrow).toHaveBeenCalledTimes(1)
  })

  it('refreshes only the affected Game Session after a successful trade', async () => {
    apiFetchOrThrow.mockResolvedValue({
      balance: { krw: 900_000, usd: 125 },
    })
    const queryClient = createQueryClient()
    const affectedKeys = [
      sessionQueryKeys.account(7, 42),
      sessionQueryKeys.holdings(7, 42),
      sessionQueryKeys.transactions(7, 42),
      sessionQueryKeys.analyticsPerformance(7, 42),
      sessionQueryKeys.analyticsByStock(7, 42),
      sessionQueryKeys.analyticsBySector(7, 42),
      sessionQueryKeys.analyticsRealized(7, 42),
      sessionQueryKeys.detail(7, 42),
      sessionQueryKeys.status(7, 42),
      sessionQueryKeys.summary(7, 42),
      sessionQueryKeys.result(7, 42),
      sessionQueryKeys.list(7, true),
    ]
    const otherSessionKey = sessionQueryKeys.account(7, 99)

    for (const key of affectedKeys) queryClient.setQueryData(key, { cached: true })
    queryClient.setQueryData(otherSessionKey, { cached: true })

    const { result } = renderHook(
      () => useTradeMutation(7, 42),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.mutateAsync({
        type: 'buy',
        payload: { ticker: 'AAPL', quantity: 2 },
      })
    })

    expect(apiFetchOrThrow).toHaveBeenCalledWith(
      '/game/sessions/42/trade/buy',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: 'AAPL', quantity: 2 }),
      },
    )
    expect(queryClient.getQueryData(sessionQueryKeys.account(7, 42))).toMatchObject({
      balance_krw: 900_000,
      balance_usd: 125,
    })
    expect(affectedKeys.every(
      (key) => queryClient.getQueryState(key)?.isInvalidated,
    )).toBe(true)
    expect(queryClient.getQueryState(otherSessionKey)?.isInvalidated).toBe(false)
  })

  it('loads the complete Game Session list under its own list key', async () => {
    apiFetchOrThrow.mockResolvedValue({ sessions: [{ id: 42 }] })
    const queryClient = createQueryClient()

    const { result } = renderHook(
      () => useSessionListQuery(7, { includeAll: true }),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data.sessions).toEqual([{ id: 42 }])
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0)
    expect(apiFetchOrThrow).toHaveBeenCalledWith(
      '/game/sessions?include_all=true',
    )
    expect(queryClient.getQueryData(sessionQueryKeys.list(7, true))).toEqual({
      sessions: [{ id: 42 }],
    })
  })

  it('loads one owned Game Session through the detail endpoint', async () => {
    apiFetchOrThrow.mockResolvedValue({ session: { id: 42, status: 'active' } })
    const queryClient = createQueryClient()

    const { result } = renderHook(
      () => useSessionDetailQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiFetchOrThrow).toHaveBeenCalledWith('/game/sessions/42')
    expect(queryClient.getQueryData(sessionQueryKeys.detail(7, 42))).toEqual({
      session: { id: 42, status: 'active' },
    })
  })

  it('loads Session analytics through one shared analytics namespace', async () => {
    apiFetchOrThrow
      .mockResolvedValueOnce([{ ticker: 'AAPL' }])
      .mockResolvedValueOnce([{ sector: 'Technology' }])
      .mockResolvedValueOnce({ total_realized_pnl: 250 })
    const queryClient = createQueryClient()

    const stock = renderHook(
      () => useAnalyticsByStockQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )
    const sector = renderHook(
      () => useAnalyticsBySectorQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )
    const realized = renderHook(
      () => useAnalyticsRealizedQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(stock.result.current.isSuccess).toBe(true)
      expect(sector.result.current.isSuccess).toBe(true)
      expect(realized.result.current.isSuccess).toBe(true)
    })

    expect(apiFetchOrThrow.mock.calls.map(([path]) => path)).toEqual([
      '/game/sessions/42/analytics/by-stock',
      '/game/sessions/42/analytics/by-sector',
      '/game/sessions/42/analytics/realized',
    ])
  })

  it('loads Session Portfolio transactions from the explicit session endpoint', async () => {
    apiFetchOrThrow.mockResolvedValue([{ id: 1, transaction_type: 'BUY' }])
    const queryClient = createQueryClient()

    const { result } = renderHook(
      () => useTransactionsQuery(7, 42),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiFetchOrThrow).toHaveBeenCalledWith(
      '/game/sessions/42/portfolio/transactions',
    )
    expect(result.current.data).toEqual([{ id: 1, transaction_type: 'BUY' }])
  })

  it('loads Game Session status, summary, and result as separate server state', async () => {
    apiFetchOrThrow
      .mockResolvedValueOnce({ status: 'active' })
      .mockResolvedValueOnce({ total_return: 10 })
      .mockResolvedValueOnce({ result_data_available: false })
    const queryClient = createQueryClient()
    const wrapper = createWrapper(queryClient)

    const status = renderHook(() => useSessionStatusQuery(7, 42), { wrapper })
    const summary = renderHook(() => useSessionSummaryQuery(7, 42), { wrapper })
    const result = renderHook(() => useSessionResultQuery(7, 42), { wrapper })

    await waitFor(() => {
      expect(status.result.current.isSuccess).toBe(true)
      expect(summary.result.current.isSuccess).toBe(true)
      expect(result.result.current.isSuccess).toBe(true)
    })

    expect(apiFetchOrThrow.mock.calls.map(([path]) => path)).toEqual([
      '/game/sessions/42/status',
      '/game/sessions/42/summary',
      '/game/sessions/42/result',
    ])
  })

  it('updates Session detail and list caches after a Session mutation', async () => {
    const updatedSession = { id: 42, title: 'Long-term plan', status: 'active' }
    apiFetchOrThrow.mockResolvedValue({ status: 'success', session: updatedSession })
    const queryClient = createQueryClient()
    queryClient.setQueryData(sessionQueryKeys.list(7, true), {
      sessions: [{ id: 42, title: 'Old title', status: 'active' }],
    })
    queryClient.setQueryData(sessionQueryKeys.detail(7, 42), {
      session: { id: 42, title: 'Old title', status: 'active' },
    })

    const { result } = renderHook(
      () => useUpdateSessionMutation(7),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 42,
        updates: { title: 'Long-term plan' },
      })
    })

    expect(apiFetchOrThrow).toHaveBeenCalledWith('/game/sessions/42', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Long-term plan' }),
    })
    expect(queryClient.getQueryData(sessionQueryKeys.detail(7, 42))).toEqual({
      session: updatedSession,
    })
    expect(queryClient.getQueryData(sessionQueryKeys.list(7, true))).toEqual({
      sessions: [updatedSession],
    })
  })

  it('removes an archived Session from the cached active-session list', async () => {
    const archivedSession = { id: 42, title: 'Review', status: 'archived' }
    apiFetchOrThrow.mockResolvedValue({ status: 'success', session: archivedSession })
    const queryClient = createQueryClient()
    queryClient.setQueryData(sessionQueryKeys.list(7, false), {
      sessions: [{ id: 42, title: 'Review', status: 'active' }],
    })
    queryClient.setQueryData(sessionQueryKeys.list(7, true), {
      sessions: [{ id: 42, title: 'Review', status: 'active' }],
    })

    const { result } = renderHook(
      () => useUpdateSessionMutation(7),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 42,
        updates: { status: 'archived' },
      })
    })

    expect(queryClient.getQueryData(sessionQueryKeys.list(7, false))).toEqual({
      sessions: [],
    })
    expect(queryClient.getQueryData(sessionQueryKeys.list(7, true))).toEqual({
      sessions: [archivedSession],
    })
  })

  it('seeds Session detail and refreshes lists after Session creation', async () => {
    const createdSession = { id: 43, title: 'Fresh start', status: 'active' }
    apiFetchOrThrow.mockResolvedValue({ status: 'success', session: createdSession })
    const queryClient = createQueryClient()
    const listKey = sessionQueryKeys.list(7, true)
    queryClient.setQueryData(listKey, { sessions: [] })

    const { result } = renderHook(
      () => useCreateSessionMutation(7),
      { wrapper: createWrapper(queryClient) },
    )
    const payload = {
      title: 'Fresh start',
      starting_balance_krw: 10_000_000,
      duration_days: 30,
    }

    await act(async () => {
      await result.current.mutateAsync(payload)
    })

    expect(apiFetchOrThrow).toHaveBeenCalledWith('/game/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(queryClient.getQueryData(sessionQueryKeys.detail(7, 43))).toEqual({
      session: createdSession,
    })
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
  })

  it('removes only the deleted Game Session from client state', async () => {
    apiFetchOrThrow.mockResolvedValue({ status: 'success', deleted_session_id: 42 })
    const queryClient = createQueryClient()
    const listKey = sessionQueryKeys.list(7, true)
    queryClient.setQueryData(listKey, {
      sessions: [{ id: 42 }, { id: 99 }],
    })
    queryClient.setQueryData(sessionQueryKeys.detail(7, 42), { session: { id: 42 } })
    queryClient.setQueryData(sessionQueryKeys.account(7, 42), { balance_krw: 10 })
    queryClient.setQueryData(sessionQueryKeys.account(7, 99), { balance_krw: 20 })

    const { result } = renderHook(
      () => useDeleteSessionMutation(7),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.mutateAsync(42)
    })

    expect(apiFetchOrThrow).toHaveBeenCalledWith('/game/sessions/42', {
      method: 'DELETE',
    })
    expect(queryClient.getQueryData(sessionQueryKeys.detail(7, 42))).toBeUndefined()
    expect(queryClient.getQueryData(sessionQueryKeys.account(7, 42))).toBeUndefined()
    expect(queryClient.getQueryData(sessionQueryKeys.account(7, 99))).toEqual({
      balance_krw: 20,
    })
    expect(queryClient.getQueryData(listKey)).toEqual({ sessions: [{ id: 99 }] })
  })
})
