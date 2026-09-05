import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiFetchOrThrow } from '../api'
import { SessionPortfolioScope } from '../query/portfolioScope'
import { useGameSessionLifecycle } from './useGameSessionLifecycle'

vi.mock('../api', () => ({ apiFetchOrThrow: vi.fn() }))
let queryClient

beforeEach(() => {
  vi.resetAllMocks()
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => {
  cleanup()
  queryClient.clear()
})

function wrapper({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionPortfolioScope userId={7} sessionId={42}>{children}</SessionPortfolioScope>
    </QueryClientProvider>
  )
}
const paths = () => apiFetchOrThrow.mock.calls.map(([path]) => path)
const root = '/game/sessions/42'

it('loads the active overview without summary/result requests, then loads summary on demand', async () => {
  let finishSummary
  apiFetchOrThrow.mockImplementation((path) => {
    if (path === `${root}/status`) return Promise.resolve({ status: 'active' })
    if (path === `${root}/analytics/performance`) return Promise.resolve({ snapshots: [] })
    if (path === `${root}/summary`) return new Promise((resolve) => { finishSummary = resolve })
    throw new Error(`Unexpected request: ${path}`)
  })
  const { result } = renderHook(() => useGameSessionLifecycle(7, 42), { wrapper })
  await waitFor(() => expect(result.current.screen).toBe('active-overview'))
  expect(paths().sort()).toEqual([`${root}/analytics/performance`, `${root}/status`])

  act(() => result.current.actions.openSummary())
  await waitFor(() => expect(result.current.screen).toBe('loading'))
  await act(async () => finishSummary({ total_return: 10 }))
  await waitFor(() => expect(result.current.screen).toBe('active-summary'))
  expect(result.current.summary.total_return).toBe(10)
  expect(paths()).not.toContain(`${root}/result`)

  act(() => result.current.actions.closeSummary())
  expect(result.current.screen).toBe('active-overview')
  apiFetchOrThrow.mockClear()
  act(() => result.current.actions.refresh())
  await waitFor(() => expect(paths()).toHaveLength(2))
  expect(paths().sort()).toEqual([`${root}/analytics/performance`, `${root}/status`])
})

it('loads saved ended results without live summary/performance requests and can retry a failure', async () => {
  let failed = true
  apiFetchOrThrow.mockImplementation(async (path) => {
    if (path === `${root}/status`) return { status: 'completed' }
    if (path === `${root}/result`) {
      if (failed) throw new Error('Result unavailable')
      return { result_data_available: false }
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  const { result } = renderHook(() => useGameSessionLifecycle(7, 42), { wrapper })
  await waitFor(() => expect(result.current.screen).toBe('ended-result-error'))
  expect(result.current.errors.result.message).toBe('Result unavailable')
  expect(paths()).toEqual([`${root}/status`, `${root}/result`])
  failed = false
  act(() => result.current.actions.refresh())
  await waitFor(() => expect(result.current.screen).toBe('ended-result'))
  expect(result.current.result.result_data_available).toBe(false)
  expect(paths()).toEqual([`${root}/status`, `${root}/result`, `${root}/status`, `${root}/result`])
})

it('does not fetch dependent resources when status fails', async () => {
  apiFetchOrThrow.mockRejectedValue(new Error('Session not found'))
  const { result } = renderHook(() => useGameSessionLifecycle(7, 42), { wrapper })
  await waitFor(() => expect(result.current.screen).toBe('status-error'))
  expect(paths()).toEqual([`${root}/status`])
})

it('allows leaving and retrying a failed summary without blocking the overview', async () => {
  let failed = true
  apiFetchOrThrow.mockImplementation(async (path) => {
    if (path === `${root}/status`) return { status: 'active' }
    if (path === `${root}/analytics/performance`) return { snapshots: [] }
    if (path === `${root}/summary`) {
      if (failed) throw new Error('Summary unavailable')
      return { total_return: 10 }
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  const { result } = renderHook(() => useGameSessionLifecycle(7, 42), { wrapper })
  await waitFor(() => expect(result.current.screen).toBe('active-overview'))
  act(() => result.current.actions.openSummary())
  await waitFor(() => expect(result.current.screen).toBe('summary-error'))
  failed = false
  await act(async () => { await result.current.actions.retrySummary() })
  await waitFor(() => expect(result.current.screen).toBe('active-summary'))
  act(() => result.current.actions.closeSummary())
  expect(result.current.screen).toBe('active-overview')
})
