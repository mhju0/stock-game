import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../api'
import { UserContext } from '../context/userContext'
import Market from './Market'
import SearchStock from './SearchStock'
import Portfolio from './Portfolio'
import Dashboard from './Dashboard'
import Transactions from './Transactions'
import Exchange from './Exchange'
import Analytics from './Analytics'
import Game from './Game'
import TradeModal from '../components/TradeModal'
import Watchlist from './Watchlist'
import Games from './Games'

const state = vi.hoisted(() => ({
  account: {}, holdings: [], transactions: [], watchlist: [], performance: {}, realized: {},
  lifecycle: {}, session: {}, sessions: [], translation: null, accountError: null, holdingsError: null,
  toggle: vi.fn(), trade: vi.fn(), create: vi.fn(),
}))
const translate = vi.hoisted(() => (key) => key)
const query = (data, error = null) => ({ data, error, refetch: vi.fn(), isLoading: false, isFetching: false, isError: Boolean(error) })

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: state.translation || translate,
  i18n: { language: 'en' },
}) }))
vi.mock('react-router-dom', async (original) => ({
  ...await original(),
  useParams: () => ({ sessionId: '101' }),
  useOutletContext: () => ({ session: state.session }),
}))
vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDelete: vi.fn(), apiPost: vi.fn() }))
vi.mock('../query/queries', () => ({
  useAccountQuery: () => query(state.account, state.accountError),
  useHoldingsQuery: () => query(state.holdings, state.holdingsError),
  useTransactionsQuery: () => query(state.transactions),
  useWatchlistQuery: () => query(state.watchlist),
  useAnalyticsPerformanceQuery: () => query(state.performance),
  useAnalyticsByStockQuery: () => query(state.holdings),
  useAnalyticsBySectorQuery: () => query([{ sector: 'Technology', allocation_pct: 100 }]),
  useAnalyticsRealizedQuery: () => query(state.realized),
  useWatchlistContainsQuery: () => query({ in_watchlist: false }),
  useWatchlistToggleMutation: () => ({ mutateAsync: state.toggle }),
  useTradeMutation: () => ({ mutateAsync: state.trade }),
  useSessionListQuery: () => query({ sessions: state.sessions }),
  useCreateSessionMutation: () => ({ mutateAsync: state.create }),
  useUpdateSessionMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteSessionMutation: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('../game/useGameSessionLifecycle', () => ({ useGameSessionLifecycle: () => state.lifecycle }))
vi.mock('recharts', () => {
  const Container = ({ children }) => <div>{children}</div>
  const Empty = () => null
  return {
    ResponsiveContainer: Container, LineChart: Container, PieChart: Container,
    Line: Empty, XAxis: Empty, YAxis: Empty, Tooltip: Empty, Legend: Empty, Cell: Empty,
    Pie: ({ isAnimationActive }) => <div data-testid="allocation-pie" data-animated={String(isAnimationActive)} />,
  }
})

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function renderPage(Page, { path = '/games/101', session = { status: 'active' } } = {}) {
  state.session = session
  return render(
    <StrictMode>
    <UserContext.Provider value={{ currentUserId: 7 }}>
      <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Page />
      </MemoryRouter>
      </QueryClientProvider>
    </UserContext.Provider>
    </StrictMode>,
  )
}

const holding = { ticker: 'AAPL', name: 'Apple', currency: 'USD', market: 'US', quantity: 1,
  avg_price: 90, current_price: 100, total_value: 100, total_value_krw: 135000,
  unrealized_pnl: 10, unrealized_pnl_pct: 11.11 }

describe('maintenance flow regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.translation = translate
    state.accountError = null
    state.holdingsError = null
    state.account = { balance_krw: 1000000, balance_usd: 12.34, exchange_rate: 1350,
      total_value_krw: 1016659, daily_change_krw: 0, daily_change_pct: 0 }
    state.holdings = [holding]
    state.transactions = []
    state.watchlist = [{ ...holding, price: 100 }]
    state.performance = { starting_value: 100, current_value: 101, total_return: 1,
      total_return_pct: 1, snapshots: [{ date: '2026-08-01', value: 100 }, { date: '2026-08-02', value: 101 }] }
    state.realized = { realized_pnl_available: true, realized_pnl_by_currency: { USD: 10, KRW: 1000 }, total_realized_pnl: null }
    state.lifecycle = { active: true, actions: {}, errors: {}, screen: 'active-overview',
      status: { duration_days: 30, days_elapsed: 2, days_remaining: 28, current_value_krw: 100,
        current_return_pct: 0, start_date: '2026-08-01', end_date: '2026-08-31' },
      performance: state.performance }
    apiFetch.mockImplementation(async (path) => {
      if (path.includes('/history')) return [{ date: '2026-08-01', close: 110 }, { date: '2026-08-02', close: 100 }]
      if (path === '/exchange-rate') return { usd_to_krw: 1350 }
      if (path.startsWith('/stock/')) return { ...holding, price: 100 }
      return []
    })
    state.toggle.mockResolvedValue({ status: 'added' })
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('keeps the selected Market when an earlier response finishes last', async () => {
    const us = deferred()
    apiFetch.mockImplementation((path) => path.endsWith('/US') ? us.promise : Promise.resolve([{ ...holding, ticker: '005930.KS', name: 'Samsung', currency: 'KRW', price: 100, change: 0, change_pct: 0 }]))
    renderPage(Market)
    fireEvent.click(screen.getByText('market.kr'))
    await screen.findByText('삼성전자')
    await act(async () => us.resolve([{ ...holding, price: 100, change: 0, change_pct: 0 }]))
    expect(screen.queryByText('Apple')).toBeNull()
    expect(screen.getByText('삼성전자')).toBeTruthy()
  })

  it('shows a minus on declining stock history amounts', async () => {
    renderPage(SearchStock, { path: '/games/101/search?ticker=AAPL' })
    await screen.findByText('-$10.00 (-9.09%)')
  })

  it('keeps the newest stock detail after overlapping selections', async () => {
    const apple = deferred()
    apiFetch.mockImplementation((path) => {
      if (path === '/stock/AAPL') return apple.promise
      if (path.startsWith('/stock/search/')) return Promise.resolve([{ ticker: 'MSFT', name: 'Microsoft' }])
      if (path === '/stock/MSFT') return Promise.resolve({ ...holding, ticker: 'MSFT', name: 'Microsoft', price: 100 })
      return Promise.resolve([])
    })
    renderPage(SearchStock, { path: '/games/101/search?ticker=AAPL' })
    fireEvent.change(screen.getByRole('textbox', { name: 'common.search' }), { target: { value: 'Microsoft' } })
    fireEvent.click(await screen.findByRole('button', { name: /Microsoft/ }))
    await screen.findByRole('heading', { name: /Microsoft/ })
    await act(async () => apple.resolve({ ...holding, price: 100 }))
    expect(screen.queryByRole('heading', { name: 'Apple' })).toBeNull()
    expect(screen.getByRole('heading', { name: /Microsoft/ })).toBeTruthy()
  })

  it('loads a ticker deep link through StrictMode effect replay', async () => {
    renderPage(() => <StrictMode><SearchStock /></StrictMode>, { path: '/games/101/search?ticker=AAPL' })
    await screen.findByRole('heading', { name: 'Apple' })
  })

  it('keeps a manual stock selection when the translation function changes', async () => {
    apiFetch.mockImplementation(async (path) => {
      if (path.startsWith('/stock/search/')) return [{ ticker: 'MSFT', name: 'Microsoft' }]
      if (path === '/stock/MSFT') return { ...holding, ticker: 'MSFT', name: 'Microsoft', price: 100 }
      if (path === '/stock/AAPL') return { ...holding, price: 100 }
      return []
    })
    renderPage(SearchStock, { path: '/games/101/search?ticker=AAPL' })
    await screen.findByRole('heading', { name: 'Apple' })
    fireEvent.change(screen.getByRole('textbox', { name: 'common.search' }), { target: { value: 'Microsoft' } })
    fireEvent.click(await screen.findByRole('button', { name: /Microsoft/ }))
    await screen.findByRole('heading', { name: 'Microsoft' })
    state.translation = (key) => key
    fireEvent.click(screen.getByText('1W'))
    await screen.findByRole('heading', { name: 'Microsoft' })
  })

  it.each([['Portfolio', Portfolio], ['Dashboard', Dashboard]])('sorts mixed-currency P&L by comparable value in %s', (_name, Page) => {
    state.holdings = [holding, { ...holding, ticker: 'KRW', name: 'Korean', currency: 'KRW', market: 'KRX', unrealized_pnl: 1000 }]
    const { container } = renderPage(Page)
    fireEvent.change(screen.getByRole('combobox', { name: 'sort.ariaLabel' }), { target: { value: 'pnl_desc' } })
    expect(container.querySelector('.interactive-row, .holding-row').textContent).toContain('Apple')
  })

  it.each([['Portfolio', Portfolio], ['Dashboard', Dashboard]])('keeps unavailable P&L last in either sorting direction in %s', (_name, Page) => {
    state.holdings = [{ ...holding, ticker: 'UNKNOWN', name: 'Unknown', current_price: null, total_value: null, unrealized_pnl: null },
      { ...holding, ticker: 'KRW', name: 'Korean', currency: 'KRW', market: 'KRX', unrealized_pnl: -10 }, holding]
    const { container } = renderPage(Page)
    for (const [sort, names] of [['pnl_desc', ['Apple', 'Korean', 'Unknown']], ['pnl_asc', ['Korean', 'Apple', 'Unknown']],
      ['value_desc', ['Apple', 'Korean', 'Unknown']], ['value_asc', ['Korean', 'Apple', 'Unknown']]]) {
      fireEvent.change(screen.getByRole('combobox', { name: 'sort.ariaLabel' }), { target: { value: sort } })
      const rows = [...container.querySelectorAll('.interactive-row, .holding-row')]
      expect(rows.map((row) => row.querySelector('strong').textContent)).toEqual(names)
    }
  })

  it.each([['Portfolio', Portfolio], ['Dashboard', Dashboard]])('keeps missing financial values neutral in %s', (_name, Page) => {
    state.account = { ...state.account, total_value_krw: null, daily_change_krw: null, daily_change_pct: null, valuation_available: false }
    state.holdings = [{ ...holding, current_price: null, total_value: null, unrealized_pnl: null }]
    const { container } = renderPage(Page)
    const chip = container.querySelector('.asset-chip')
    expect(chip.classList.contains('up') || chip.classList.contains('down')).toBe(false)
    const row = container.querySelector('.interactive-row, .holding-row')
    expect(row.querySelector('.positive, .negative')).toBeNull()
    expect(row.textContent).not.toMatch(/[+-]common\.unavailable/)
  })

  it('preserves a transaction loss sign without depending on color', () => {
    state.transactions = [{ id: 1, ticker: 'AAPL', name: 'Apple', currency: 'USD', transaction_type: 'SELL', quantity: 1,
      price: 100, total_amount: 100, realized_pnl: -10, created_at: '2026-08-01T00:00:00Z' }]
    renderPage(Transactions)
    expect(screen.getByText('-$10.00')).toBeTruthy()
  })

  it('shows unknown sell P&L as unavailable and keeps measured zero hidden', () => {
    state.transactions = [null, 0].map((realized_pnl, id) => ({ id, ticker: 'AAPL', name: 'Apple', currency: 'USD', transaction_type: 'SELL',
      quantity: 1, price: 100, total_amount: 100, realized_pnl, created_at: '2026-08-01T00:00:00Z' }))
    const { container } = renderPage(Transactions)
    const unknown = screen.getByText('common.unavailable')
    expect(unknown.classList.contains('positive') || unknown.classList.contains('negative')).toBe(false)
    expect(unknown.style.color).toBe('')
    expect(container.querySelectorAll('.transaction-row')[1].textContent).not.toContain('$0.00')
  })

  it('uses the shared Watchlist mutation from stock details', async () => {
    renderPage(SearchStock, { path: '/games/101/search?ticker=AAPL' })
    await screen.findByText('Apple')
    fireEvent.click(screen.getByText('+ watchlist.title'))
    await waitFor(() => expect(state.toggle).toHaveBeenCalledWith({ ticker: 'AAPL', isInWatchlist: false }))
  })

  it('uses the shared Watchlist mutation when removing a saved stock', async () => {
    renderPage(Watchlist)
    fireEvent.click(screen.getByText('watchlist.remove'))
    await waitFor(() => expect(state.toggle).toHaveBeenCalledWith({ ticker: 'AAPL', isInWatchlist: true }))
  })

  it('keeps unavailable Watchlist quotes explicit and after known prices', () => {
    state.watchlist = [{ ...holding, ticker: 'UNKNOWN', name: 'Unknown', price: null }, { ...holding, price: 100 }]
    const { container } = renderPage(Watchlist)
    fireEvent.change(screen.getByRole('combobox', { name: 'sort.ariaLabel' }), { target: { value: 'price_asc' } })
    expect(container.querySelector('.watchlist-row strong').textContent).toBe('Apple')
    expect(screen.getByText('common.unavailable')).toBeTruthy()
  })

  it('exchanges all USD funds including cents', async () => {
    renderPage(Exchange)
    fireEvent.click(await screen.findByText('USD → KRW'))
    fireEvent.click(screen.getByText('exchange.allFunds'))
    expect(screen.getByRole('spinbutton').value).toBe('12.34')
  })

  it('keeps benchmark identity aligned with the latest selection', async () => {
    const sp = deferred()
    apiFetch.mockImplementation((path) => path.includes('SP500') ? sp.promise : Promise.resolve([{ date: '2026-08-02', change_pct: 5 }]))
    renderPage(Game)
    fireEvent.click(screen.getByText('KOSPI'))
    await screen.findByRole('img', { name: /KOSPI: 5.00%/ })
    await act(async () => sp.resolve([{ date: '2026-08-02', change_pct: 10 }]))
    expect(screen.getByRole('img', { name: /KOSPI: 5.00%/ })).toBeTruthy()
  })

  it('keeps a pending trade ticket open until the request settles', async () => {
    const trade = deferred()
    state.trade.mockReturnValue(trade.promise)
    const close = vi.fn()
    renderPage(() => <TradeModal ticker="AAPL" onClose={close} />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByText('stock.sell'))
    fireEvent.click(screen.getByText('common.confirm'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
    await act(async () => trade.resolve({ status: 'success' }))
  })

  it('keeps unavailable ticket balances and holdings distinct from measured zero', async () => {
    state.account = undefined
    state.holdings = undefined
    state.accountError = new Error('Account unavailable')
    state.holdingsError = new Error('Holdings unavailable')
    const { container } = renderPage(() => <TradeModal ticker="AAPL" onClose={vi.fn()} />)
    await screen.findByRole('dialog')
    expect([...container.querySelectorAll('.trade-context-value')].map((element) => element.textContent))
      .toEqual(['common.unavailable', 'common.unavailable'])
  })

  it('does not run an old ticket completion after unmount', async () => {
    const complete = vi.fn()
    state.trade.mockResolvedValue({ status: 'success' })
    const view = renderPage(() => <TradeModal ticker="AAPL" onClose={vi.fn()} onComplete={complete} />)
    await screen.findByRole('dialog')
    vi.useFakeTimers()
    fireEvent.click(screen.getByText('stock.sell'))
    await act(async () => fireEvent.click(screen.getByText('common.confirm')))
    view.unmount()
    act(() => vi.runAllTimers())
    expect(complete).not.toHaveBeenCalled()
  })

  it.each(['buy', 'sell'])('keeps a second pending %s open past the first order completion timer', async (type) => {
    state.account = { ...state.account, balance_usd: 1000 }
    state.holdings = [{ ...holding, quantity: 3 }]
    const secondOrder = deferred()
    state.trade.mockReset().mockResolvedValueOnce({ status: 'success' }).mockReturnValueOnce(secondOrder.promise)
    const complete = vi.fn()
    function Ticket() {
      const [open, setOpen] = useState(true)
      return open ? <TradeModal ticker="AAPL" onClose={vi.fn()} onComplete={() => { complete(); setOpen(false) }} /> : null
    }
    renderPage(Ticket)
    await screen.findByRole('dialog')
    vi.useFakeTimers()
    fireEvent.click(screen.getByText(`stock.${type}`))
    await act(async () => fireEvent.click(screen.getByText('common.confirm')))
    expect(state.trade).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(400))
    fireEvent.click(screen.getByText(`stock.${type}`))
    await act(async () => fireEvent.click(screen.getByText('common.confirm')))
    expect(state.trade).toHaveBeenCalledTimes(2)
    act(() => vi.advanceTimersByTime(500))
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'common.loading' }).disabled).toBe(true)
    await act(async () => secondOrder.resolve({ status: 'success' }))
    act(() => vi.advanceTimersByTime(799))
    expect(complete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(complete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps active realized profit currencies separate and disables pie animation', () => {
    renderPage(Analytics)
    expect(screen.getByText('+$10.00')).toBeTruthy()
    expect(screen.getByText('+₩1,000')).toBeTruthy()
    expect(screen.getByTestId('allocation-pie').dataset.animated).toBe('false')
  })

  it('keeps unavailable realized P&L neutral rather than implying a gain', () => {
    state.realized = { realized_pnl_available: false, realized_pnl_by_currency: {}, total_realized_pnl: null }
    renderPage(Analytics)
    const value = screen.getByText('common.unavailable')
    expect(value.classList.contains('positive')).toBe(false)
    expect(value.classList.contains('negative')).toBe(false)
  })

  it('keeps failed Analytics exchange-rate data explicit rather than enabling guessed conversion', () => {
    state.account = undefined
    state.accountError = new Error('Account unavailable')
    renderPage(Analytics)
    expect(screen.getByText('Account unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeTruthy()
  })

  it('keeps mixed-currency active summary amounts in their own currencies', () => {
    state.lifecycle.screen = 'active-summary'
    state.lifecycle.summary = { total_return: 1, total_return_pct: 1, starting_balance: 100, current_value: 101,
      days_elapsed: 2, duration_days: 30, total_trades: 2, total_buys: 0, total_sells: 2,
      winning_trades: 1, losing_trades: 1, win_rate: 50, realized_pnl_available: true,
      realized_pnl_by_currency: { USD: -10, KRW: 1000 }, realized_pnl: null, peak_value: 101, trough_value: 100 }
    renderPage(Game)
    expect(screen.getByText('-$10.00')).toBeTruthy()
    expect(screen.getByText('+₩1,000')).toBeTruthy()
  })

  it('keeps unavailable active summary returns neutral', () => {
    state.lifecycle.screen = 'active-summary'
    state.lifecycle.summary = { total_return: null, total_return_pct: null, starting_balance: 100, current_value: null,
      days_elapsed: 2, duration_days: 30, total_trades: 0, total_buys: 0, total_sells: 0,
      winning_trades: 0, losing_trades: 0, win_rate: 0, realized_pnl_available: true,
      realized_pnl_by_currency: {}, realized_pnl: 0, peak_value: 100, trough_value: 100 }
    const { container } = renderPage(Game)
    const hero = container.querySelector('.card')
    expect(hero.querySelector('.positive, .negative')).toBeNull()
    expect(hero.textContent).not.toMatch(/[+-]common\.unavailable/)
  })

  it('shows unavailable Overview valuation instead of fabricated zero', () => {
    state.lifecycle.status = { ...state.lifecycle.status, valuation_available: false, current_value_krw: null, current_return_pct: null }
    const { container } = renderPage(Game)
    expect(container.querySelector('.overview-hero-value').textContent).toBe('common.unavailable')
    expect(screen.queryByText('+%')).toBeNull()
    expect(screen.getAllByText('common.unavailable').length).toBeGreaterThan(0)
    expect(container.querySelector('.overview-return').classList.contains('positive')).toBe(false)
    expect(container.querySelector('.overview-return').classList.contains('negative')).toBe(false)
  })

  it('shows unavailable Portfolio valuation instead of fabricated zero', () => {
    state.account = { ...state.account, valuation_available: false, total_value_krw: null, daily_change_krw: null, daily_change_pct: null }
    renderPage(Portfolio)
    expect(screen.getAllByText('common.unavailable').length).toBeGreaterThan(0)
  })

  it('keeps cash balances visible before the first holding is bought', () => {
    state.holdings = []
    renderPage(Portfolio)
    expect(screen.getByText('₩1,000,000')).toBeTruthy()
    expect(screen.getByText('portfolio.emptyTitle')).toBeTruthy()
  })

  it('marks list valuations unavailable instead of showing zero', () => {
    state.sessions = [{ id: 101, title: 'Active', status: 'active', start_date: '2026-08-01', end_date: '2026-08-31',
      last_updated_at: '2026-08-02', duration_days: 30, current_value_krw: null, current_return_pct: null }]
    const { container } = renderPage(Games)
    expect(container.querySelector('.game-card-metric-value').textContent).toBe('common.unavailable')
    expect(container.querySelector('.game-card-metrics .positive, .game-card-metrics .negative')).toBeNull()
  })

  it('presents ended stock inspection as review rather than a new trade', async () => {
    renderPage(SearchStock, { path: '/games/101/search?ticker=AAPL', session: { status: 'completed' } })
    await screen.findByText('Apple')
    expect(screen.queryByText('stock.openTicket')).toBeNull()
    expect(screen.getByText('stock.reviewTicket')).toBeTruthy()
  })

  it('distinguishes a history request error from limited chart data and retries it', async () => {
    apiFetch.mockImplementation(async (path, _options, onError) => {
      if (path.includes('/history')) { onError?.('History unavailable'); return null }
      return { ...holding, price: 100 }
    })
    renderPage(SearchStock, { path: '/games/101/search?ticker=AAPL' })
    await screen.findByRole('alert')
    expect(screen.getByText('History unavailable')).toBeTruthy()
    const before = apiFetch.mock.calls.filter(([path]) => path.includes('/history')).length
    fireEvent.click(screen.getByText('common.retry'))
    await waitFor(() => expect(apiFetch.mock.calls.filter(([path]) => path.includes('/history')).length).toBeGreaterThan(before))
  })

  it.each(['-1', '1.5', '1e3', '1,23', '1000000000001'])('blocks invalid custom starting amount %s without silently changing it', (value) => {
    renderPage(() => <Games startSetup />)
    fireEvent.click(screen.getByText('games.customAmount'))
    fireEvent.change(screen.getByRole('textbox', { name: 'games.customAmountLabel' }), { target: { value } })
    expect(screen.getByRole('button', { name: 'games.startGame' }).disabled).toBe(true)
    expect(state.create).not.toHaveBeenCalled()
  })

  it.each(['-1', '1.5', '3651'])('blocks invalid custom duration %s', (value) => {
    renderPage(() => <Games startSetup />)
    fireEvent.click(screen.getByText('games.customDuration'))
    fireEvent.change(screen.getByRole('textbox', { name: 'games.customDurationLabel' }), { target: { value } })
    expect(screen.getByRole('button', { name: 'games.startGame' }).disabled).toBe(true)
  })

  it('preserves grouped integer amounts and existing setup presets', () => {
    renderPage(() => <Games startSetup />)
    expect(screen.getByRole('button', { name: 'games.startGame' }).disabled).toBe(false)
    fireEvent.click(screen.getByText('games.customAmount'))
    fireEvent.change(screen.getByRole('textbox', { name: 'games.customAmountLabel' }), { target: { value: '1,000,000' } })
    expect(screen.getByRole('button', { name: 'games.startGame' }).disabled).toBe(false)
  })

  it.each([['Portfolio', Portfolio], ['Dashboard', Dashboard], ['Analytics', Analytics]])('offers only supported working holding sorts in %s', (_name, Page) => {
    state.holdings = [{ ...holding, current_price: 185, avg_price: 180, total_value: 185, total_value_krw: 249750, unrealized_pnl: 5, unrealized_pnl_pct: 2.78 },
      { ...holding, ticker: 'KRW', name: 'Zebra', currency: 'KRW', market: 'KRX', current_price: 200000, avg_price: 100000,
        total_value: 200000, total_value_krw: 200000, unrealized_pnl: 100000, unrealized_pnl_pct: 100 }]
    const { container } = renderPage(Page)
    const select = screen.getByRole('combobox', { name: 'sort.ariaLabel' })
    const outcomes = { alloc_desc: 'Apple', alloc_asc: 'Zebra', name_asc: 'Apple', name_desc: 'Zebra',
      value_desc: 'Apple', value_asc: 'Zebra', pnl_desc: 'Zebra', pnl_asc: 'Apple' }
    expect([...select.options].map((option) => option.value).sort()).toEqual(Object.keys(outcomes).sort())
    for (const [sort, firstName] of Object.entries(outcomes)) {
      fireEvent.change(select, { target: { value: sort } })
      expect(container.querySelector('.interactive-row strong, .holding-row strong').textContent).toBe(firstName)
    }
  })

  it('gives the labeled game count summary an accessible group role', () => {
    state.sessions = [{ id: 101, title: 'Active', status: 'active', start_date: '2026-08-01', end_date: '2026-08-31',
      last_updated_at: '2026-08-02', duration_days: 30, current_value_krw: 100, current_return_pct: 0 }]
    const { container } = renderPage(Games)
    expect(container.querySelector('.page-header-meta').getAttribute('role')).toBe('group')
  })
})
