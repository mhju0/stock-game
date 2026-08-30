import { expect, test } from '@playwright/test'

const activeSession = {
  id: 101,
  title: 'Active Strategy',
  status: 'active',
  start_date: '2026-08-01T00:00:00Z',
  end_date: '2026-09-30T00:00:00Z',
  duration_days: 60,
  current_value_krw: 10_250_000,
  current_return_pct: 2.5,
  last_updated_at: '2026-08-30T12:00:00Z',
}

const archivedSession = {
  id: 202,
  title: 'Archived Review',
  status: 'archived',
  start_date: '2026-05-01T00:00:00Z',
  end_date: '2026-06-01T00:00:00Z',
  duration_days: 31,
  current_value_krw: 10_800_000,
  current_return_pct: 8,
  last_updated_at: '2026-06-01T12:00:00Z',
}

const account = {
  balance_krw: 5_000_000,
  balance_usd: 5_000,
  total_value_krw: 11_750_000,
  daily_change_krw: 125_000,
  daily_change_pct: 1.08,
  exchange_rate: 1_350,
}

const appleHolding = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  market: 'US',
  currency: 'USD',
  sector: 'Technology',
  quantity: 1,
  avg_price: 180,
  current_price: 185,
  total_value: 185,
  unrealized_pnl: 5,
  market_cap: 2_900_000_000_000,
}

async function seedAuthenticatedUser(page) {
  await page.addInitScript(() => {
    const encode = (value) => btoa(JSON.stringify(value))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: '7' })}.test`
    localStorage.setItem('stockGameToken', token)
    localStorage.setItem('lang', 'en')
  })
}

async function installApiFixture(page) {
  let purchaseComplete = false

  await page.route('http://127.0.0.1:8000/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const { pathname } = url
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4173' },
      body: JSON.stringify(body),
    })

    if (request.method() === 'OPTIONS') return respond({})
    if (pathname === '/game/sessions') {
      return respond({ sessions: [activeSession, archivedSession] })
    }
    if (pathname === '/game/sessions/101') return respond({ session: activeSession })
    if (pathname === '/game/sessions/202') return respond({ session: archivedSession })
    if (pathname === '/game/sessions/101/status') {
      return respond({
        ...activeSession,
        starting_balance_krw: 10_000_000,
        days_elapsed: 30,
        days_remaining: 30,
      })
    }
    if (pathname === '/game/sessions/202/status') {
      return respond({
        ...archivedSession,
        starting_balance_krw: 10_000_000,
        days_elapsed: 31,
        days_remaining: 0,
      })
    }
    if (pathname.endsWith('/summary')) return respond({})
    if (pathname === '/game/sessions/101/result') return respond({})
    if (pathname === '/game/sessions/202/result') {
      return respond({
        ...archivedSession,
        result_data_available: true,
        starting_value_krw: 10_000_000,
        ending_value_krw: 10_800_000,
        total_return_krw: 800_000,
        total_return_pct: 8,
        final_cash_krw: 6_000_000,
        final_cash_usd: 1_000,
        trade_count: 4,
        exchange_count: 1,
        realized_pnl: { by_currency: { USD: 225 } },
        best_stock: null,
        worst_stock: null,
        final_holdings: [appleHolding],
      })
    }
    if (pathname === '/game/sessions/101/analytics/performance') {
      return respond({
        starting_value: 10_000_000,
        snapshots: [
          { date: '2026-08-01T00:00:00Z', value: 10_000_000 },
          { date: '2026-08-30T00:00:00Z', value: 10_250_000 },
        ],
      })
    }
    if (pathname.startsWith('/game/benchmark/')) {
      return respond([
        { date: '2026-08-01', change_pct: 0 },
        { date: '2026-08-30', change_pct: 1.4 },
      ])
    }
    if (pathname === '/stock/search/Apple') {
      return respond([{ ticker: 'AAPL', name_en: 'Apple Inc.', exchange: 'NASDAQ' }])
    }
    if (pathname === '/stock/AAPL') {
      return respond({
        ticker: 'AAPL',
        name: 'Apple Inc.',
        market: 'US',
        currency: 'USD',
        price: 185,
        sector: 'Technology',
        industry: 'Consumer Electronics',
      })
    }
    if (pathname === '/stock/AAPL/history') {
      return respond([
        { date: '2026-08-01T00:00:00Z', close: 178 },
        { date: '2026-08-30T00:00:00Z', close: 185 },
      ])
    }
    if (pathname === '/game/sessions/101/portfolio/account') return respond(account)
    if (pathname === '/game/sessions/101/portfolio/holdings') {
      return respond(purchaseComplete ? [appleHolding] : [])
    }
    if (pathname === '/watchlist/contains') return respond({ in_watchlist: false })
    if (pathname === '/game/sessions/101/trade/buy' && request.method() === 'POST') {
      purchaseComplete = true
      return respond({ status: 'success', balance: { krw: 5_000_000, usd: 4_815 } })
    }

    return respond({ detail: `Unhandled test request: ${request.method()} ${url.pathname}${url.search}` }, 500)
  })
}

test.beforeEach(async ({ page }) => {
  await seedAuthenticatedUser(page)
  await installApiFixture(page)
})

test('completes the core trading review flow', async ({ page }, testInfo) => {
  await page.goto('/games')
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible()

  const activeCard = page.locator('.game-session-card').filter({ hasText: 'Active Strategy' })
  await activeCard.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Current Game' })).toBeVisible()
  await expect(page.getByRole('img', { name: /My Portfolio: 2\.50%.*S&P 500: 1\.40%/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('desktop-game-status.png'), fullPage: true })

  await page.locator('.app-sidebar').getByRole('link', { name: 'Trade' }).click()
  const search = page.getByRole('textbox', { name: 'Search' })
  await search.fill('Apple')
  await page.getByRole('button', { name: /Apple.*View details/ }).click()
  await page.getByRole('button', { name: 'Buy / Sell' }).click()

  const tradeDialog = page.getByRole('dialog', { name: 'Apple' })
  await tradeDialog.getByRole('button', { name: 'Buy', exact: true }).click()
  await tradeDialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(tradeDialog.getByText('Purchase complete')).toBeVisible()

  await page.locator('.app-sidebar').getByRole('link', { name: 'Portfolio' }).click()
  await expect(page.getByRole('button', { name: /Apple.*Trade/ })).toBeVisible()

  await page.locator('.app-sidebar').getByRole('link', { name: 'My Games' }).click()
  const archivedCard = page.locator('.game-session-card').filter({ hasText: 'Archived Review' })
  await archivedCard.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Archived Review' })).toBeVisible()
  await expect(page.getByText('Ending Value')).toBeVisible()
  await expect(page.getByText('+8%')).toBeVisible()
})

test('keeps the authenticated shell usable on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/games/101')

  await expect(page.locator('.app-sidebar')).toBeHidden()
  await expect(page.locator('.mobile-tabbar')).toBeVisible()
  await expect(page.locator('.mobile-header')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current Game' })).toBeVisible()

  const tabs = page.locator('.mobile-tabbar .mobile-tab')
  for (const box of await tabs.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }))) {
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile-game-status.png'), fullPage: true })
  await page.getByText('More', { exact: true }).click()
  await expect(page.locator('.mobile-more-menu').getByRole('link', { name: 'Analysis' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-more-menu.png'), fullPage: true })

  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await skipLink.focus()
  await expect(skipLink).toBeVisible()
})
