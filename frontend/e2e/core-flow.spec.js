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
  completed_at: '2026-05-16T00:00:00Z',
}

const account = {
  balance_krw: 5_000_000,
  balance_usd: 3_888.8888888888887,
  total_value_krw: 10_250_000,
  daily_change_krw: 125_000,
  daily_change_pct: 1.23,
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

const postTradeAccount = {
  ...account,
  balance_usd: account.balance_usd - appleHolding.current_price,
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
        current_value: 10_250_000,
        total_return: 250_000,
        total_return_pct: 2.5,
        snapshots: [
          { date: '2026-08-01T00:00:00Z', value: 10_000_000, holdings_value: 0 },
          { date: '2026-08-30T00:00:00Z', value: 10_250_000, holdings_value: 249_750 },
        ],
      })
    }
    if (pathname === '/game/sessions/101/analytics/by-stock') {
      return respond([{ ...appleHolding, total_value_krw: 249_750, unrealized_pnl_pct: 2.78 }])
    }
    if (pathname === '/game/sessions/101/analytics/by-sector') {
      return respond([{ sector: 'Technology', allocation_pct: 100 }])
    }
    if (pathname === '/game/sessions/101/analytics/realized') {
      return respond({ total_realized_pnl: 0 })
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
    if (pathname === '/game/sessions/101/portfolio/account') {
      return respond(purchaseComplete ? postTradeAccount : account)
    }
    if (pathname === '/game/sessions/101/portfolio/holdings') {
      return respond(purchaseComplete ? [appleHolding] : [])
    }
    if (pathname === '/game/sessions/101/portfolio/transactions') {
      return respond([{
        id: 1,
        transaction_type: 'BUY',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        quantity: 1,
        price: 185,
        total_amount: 185,
        realized_pnl: 0,
        created_at: '2026-08-30T12:00:00Z',
      }])
    }
    if (pathname === '/watchlist/') {
      return respond([{ ...appleHolding, price: 185 }])
    }
    if (pathname === '/watchlist/add' && request.method() === 'POST') {
      return respond({ status: 'added' })
    }
    if (pathname === '/watchlist/contains') return respond({ in_watchlist: false })
    if (pathname === '/market/top30/US') {
      return respond([{ ...appleHolding, price: 185, change: 2.5, change_pct: 1.37 }])
    }
    if (pathname === '/exchange-rate') return respond({ usd_to_krw: 1_350 })
    if (pathname === '/game/sessions/101/trade/buy' && request.method() === 'POST') {
      purchaseComplete = true
      return respond({
        status: 'success',
        balance: {
          krw: postTradeAccount.balance_krw,
          usd: postTradeAccount.balance_usd,
        },
      })
    }
    if (pathname === '/game/sessions/101/trade/exchange' && request.method() === 'POST') {
      return respond({
        exchange: { from: 'KRW', to: 'USD', amount: 10_000, converted: 7.4074 },
        balance: { krw: 4_990_000, usd: 5_007.4074 },
      })
    }

    return respond({ detail: `Unhandled test request: ${request.method()} ${url.pathname}${url.search}` }, 500)
  })
}

async function expectDialogFocusTrap(page, dialog) {
  const focusable = dialog.locator(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )
  const first = focusable.first()
  const last = focusable.last()

  await last.focus()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()

  await first.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
}

async function expectChartCaptureToBeStable(page) {
  const chart = page.locator('.chart-visual')
  const firstCapture = await chart.screenshot({ animations: 'disabled' })
  await page.waitForTimeout(100)
  const secondCapture = await chart.screenshot({ animations: 'disabled' })

  expect(secondCapture.equals(firstCapture)).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-31T00:00:00Z'))
  await installApiFixture(page)
})

test('completes the core trading review flow', async ({ page }, testInfo) => {
  await seedAuthenticatedUser(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/games')
  await expect(page.getByRole('heading', { name: 'My Games' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const desktopThemeToggle = page.locator('.app-sidebar').getByRole('button', { name: 'Use light theme' })
  await desktopThemeToggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stockGameTheme'))).toBe('light')
  await page.locator('.app-sidebar').getByRole('button', { name: 'Use dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await expect(page.locator('#main-content')).toHaveCSS('outline-style', 'none')
  await page.screenshot({ path: testInfo.outputPath('games-overview.png'), fullPage: true, animations: 'disabled' })

  await page.getByRole('button', { name: 'Create new game' }).click()
  const setupDialog = page.getByRole('dialog')
  await expect(setupDialog).toBeVisible()
  await expectDialogFocusTrap(page, setupDialog)
  await page.keyboard.press('Escape')
  await expect(setupDialog).toBeHidden()

  const activeCard = page.locator('.game-session-card').filter({ hasText: 'Active Strategy' })
  await expect(activeCard.getByRole('progressbar', { name: 'Game progress' })).toBeVisible()
  await expect(activeCard).toContainText('50% complete')
  await activeCard.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Current Game' })).toBeVisible()
  await expect(page.locator('.sidebar-game-context')).toContainText('Active Strategy')
  await expect(page.locator('.app-sidebar').getByRole('link', { name: 'Overview' })).toBeVisible()
  await expect(page.locator('.overview-hero')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Trade stocks' })).toBeVisible()
  await expect(page.getByRole('img', { name: /My Portfolio: 2\.50%.*S&P 500: 1\.40%/ })).toBeVisible()
  await expectChartCaptureToBeStable(page)
  await page.setViewportSize({ width: 1440, height: 1044 })
  const skipLinkState = await page.locator('.skip-link').evaluate((element) => ({
    active: document.activeElement === element,
    top: element.getBoundingClientRect().top,
  }))
  expect(skipLinkState.active).toBe(false)
  expect(skipLinkState.top).toBeLessThan(0)
  await page.screenshot({ path: testInfo.outputPath('performance-benchmark.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.locator('.app-sidebar').getByRole('link', { name: 'Trade' }).click()
  await expect(page.getByRole('heading', { name: 'Find your next trade' })).toBeVisible()
  const search = page.getByRole('textbox', { name: 'Search' })
  await search.fill('Apple')
  await page.getByRole('button', { name: /Apple.*View details/ }).click()
  await page.getByRole('button', { name: '+ Watchlist', exact: true }).click()
  const watchlistSuccess = page.getByRole('status').filter({ hasText: 'Apple Inc. → Watchlist' })
  await expect(watchlistSuccess).toBeVisible()
  const { watchlistFeedbackColor, accentColor } = await watchlistSuccess.evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    element.appendChild(probe)
    const colors = {
      watchlistFeedbackColor: getComputedStyle(element).color,
      accentColor: getComputedStyle(probe).color,
    }
    probe.remove()
    return colors
  })
  expect(watchlistFeedbackColor).toBe(accentColor)
  await page.getByRole('button', { name: 'Open trade ticket' }).click()

  const tradeDialog = page.getByRole('dialog', { name: 'Apple' })
  await expectDialogFocusTrap(page, tradeDialog)
  await tradeDialog.getByRole('button', { name: 'Buy', exact: true }).click()
  await tradeDialog.getByRole('button', { name: 'Confirm' }).click()
  const tradeSuccess = tradeDialog.getByText('Purchase complete')
  await expect(tradeSuccess).toBeVisible()
  await expect(tradeSuccess).toHaveAttribute('role', 'status')

  await page.locator('.app-sidebar').getByRole('link', { name: 'Portfolio' }).click()
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Apple.*Trade/ })).toBeVisible()
  const assetHero = page.locator('.asset-hero')
  await expect(assetHero.getByText('₩10,250,000', { exact: true })).toBeVisible()
  await expect(assetHero.getByText('₩249,750', { exact: true })).toBeVisible()
  await expect(assetHero.getByText('₩5,000,000', { exact: true })).toBeVisible()
  await expect(assetHero.getByText('₩5,000,250', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('portfolio-summary.png'), fullPage: true, animations: 'disabled' })

  await page.locator('.app-sidebar').getByRole('link', { name: 'My Games' }).click()
  const archivedCard = page.locator('.game-session-card').filter({ hasText: 'Archived Review' })
  await expect(archivedCard).toContainText('48% complete')
  await archivedCard.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Archived Review' })).toBeVisible()
  await expect(page.getByText('Ending Value')).toBeVisible()
  await expect(page.getByText('+8%')).toBeVisible()
})

test('keeps the authenticated shell usable on a narrow screen', async ({ page }, testInfo) => {
  await seedAuthenticatedUser(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/games/101')

  await expect(page.locator('.app-sidebar')).toBeHidden()
  await expect(page.locator('.mobile-tabbar')).toBeVisible()
  await expect(page.locator('.mobile-header')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current Game' })).toBeVisible()

  const tabs = page.locator('.mobile-tabbar .mobile-tab')
  await expect(tabs).toHaveCount(5)
  await expect(tabs.nth(1)).toContainText('Overview')
  for (const box of await tabs.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }))) {
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }

  await page.setViewportSize({ width: 375, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('mobile-game-status.png'), animations: 'disabled' })
  await page.getByText('More', { exact: true }).click()
  await expect(page.locator('.mobile-more-menu').getByRole('link', { name: 'Analysis' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('mobile-more-menu.png'), fullPage: true, animations: 'disabled' })

  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await skipLink.focus()
  await expect(skipLink).toBeVisible()
})

test('respects reduced motion in the authenticated route stage', async ({ page }) => {
  await seedAuthenticatedUser(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/games/101')

  const routeStage = page.locator('.route-stage')
  await expect(routeStage).toBeVisible()
  expect(await routeStage.evaluate((element) => {
    const value = getComputedStyle(element).animationDuration
    return value.endsWith('ms') ? Number.parseFloat(value) / 1000 : Number.parseFloat(value)
  })).toBeLessThanOrEqual(0.001)
  await expect(page.getByRole('heading', { name: 'Current Game' })).toBeVisible()
})

test('presents the simulator clearly before sign in', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/login')

  expect(await page.evaluate(() => localStorage.getItem('stockGameToken'))).toBeNull()
  await expect(page.getByRole('heading', { name: 'Practice the market. Keep the lesson.' })).toBeVisible()
  await expect(page.getByText('Virtual cash. Real market context.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByText('Demo account — username: demo · password: demo1234')).toBeVisible()
  const authThemeToggle = page.getByRole('button', { name: 'Use light theme' })
  await expect(authThemeToggle).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('auth-showcase.png'), fullPage: true, animations: 'disabled' })

  await authThemeToggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.auth-story')).toHaveCSS('color', 'rgb(244, 247, 251)')
  await page.screenshot({ path: testInfo.outputPath('auth-showcase-light.png'), fullPage: true, animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.auth-story')).toBeHidden()
  await expect(page.locator('.auth-mobile-brand')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('auth-mobile.png'), fullPage: true, animations: 'disabled' })
})

test('keeps secondary workspaces clear and connected', async ({ page }, testInfo) => {
  await seedAuthenticatedUser(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/games/101/analytics')

  await expect(page.getByRole('heading', { name: 'Analysis' })).toBeVisible()
  await expect(page.getByText('Decision review', { exact: true })).toBeVisible()

  await page.locator('.app-sidebar').getByRole('link', { name: 'Watchlist' }).click()
  await expect(page.getByRole('heading', { name: 'Watchlist' })).toBeVisible()

  await page.locator('.app-sidebar').getByRole('link', { name: 'Market' }).click()
  await expect(page.getByRole('heading', { name: 'Market' })).toBeVisible()
  const marketRow = page.getByRole('button', { name: /Apple.*View details/ })
  await expect(marketRow.getByText('1', { exact: true })).toHaveCount(0)

  await page.locator('.app-sidebar').getByRole('link', { name: 'FX Exchange' }).click()
  await expect(page.getByRole('heading', { name: 'Currency Exchange' })).toBeVisible()
  await page.getByRole('spinbutton', { name: 'Amount' }).fill('10000')
  await page.getByRole('button', { name: 'Exchange', exact: true }).click()
  const exchangeSuccess = page.getByText('Exchanged ₩10,000 → $7.41')
  await expect(exchangeSuccess).toBeVisible()
  await expect(exchangeSuccess).toHaveAttribute('role', 'status')

  await page.locator('.app-sidebar').getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
  await expect(page.getByText('1 recorded action')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('secondary-workspace.png'), fullPage: true, animations: 'disabled' })
})
