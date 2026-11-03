import { expect, test } from '@playwright/test'

test('creates and manages a first game through the public authentication flow', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-31T00:00:00Z'))
  await page.addInitScript(() => localStorage.setItem('lang', 'en'))
  await page.setViewportSize({ width: 1440, height: 900 })
  let session = null
  const mutations = []
  const listQueries = []
  const authRequests = []
  const username = 'acceptance_user'
  const password = 'AcceptancePass123!'
  const encode = (value) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const token = `${encode({ alg: 'none' })}.${encode({ sub: '7', exp: Date.parse('2026-08-31T01:00:00Z') / 1000 })}.test`
  await page.route('http://127.0.0.1:8000/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': request.headers().origin || '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type' },
      body: JSON.stringify(body) })
    if (request.method() === 'OPTIONS') return respond({})
    if (url.pathname === '/auth/register' || url.pathname === '/auth/login') {
      const payload = request.postDataJSON()
      authRequests.push({ path: url.pathname, payload, authorization: request.headers().authorization })
      if (payload.password !== password) return respond({ detail: 'Invalid username or password' }, 401)
      return respond({ access_token: token, token_type: 'bearer', user_id: 7, username }, url.pathname === '/auth/register' ? 201 : 200)
    }
    if (url.pathname === '/game/sessions' && request.method() === 'GET') {
      listQueries.push(url.searchParams.get('include_all'))
      return respond({ sessions: session && (url.searchParams.get('include_all') === 'true' || session.status === 'active') ? [session] : [] })
    }
    if (url.pathname === '/game/sessions' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      mutations.push({ method: 'POST', payload })
      session = { id: 303, title: payload.title, status: 'active', is_active: true, is_expired: false,
        starting_balance_krw: payload.starting_balance_krw, starting_balance_usd: 0,
        cash_krw: payload.starting_balance_krw, cash_usd: 0, current_value_krw: payload.starting_balance_krw,
        current_return_pct: 0, duration_days: payload.duration_days,
        start_date: '2026-08-31T00:00:00Z', end_date: '2026-09-21T00:00:00Z',
        last_updated_at: '2026-08-31T00:00:00Z', valuation_available: true, valuation_source: 'live_market_prices' }
      return respond({ status: 'success', session })
    }
    if (url.pathname === '/game/sessions/303' && request.method() === 'PATCH') {
      const payload = request.postDataJSON()
      mutations.push({ method: 'PATCH', payload })
      session = { ...session, ...payload }
      if (payload.status === 'archived') session = { ...session, is_active: false, completed_at: '2026-08-31T00:00:00Z', valuation_source: 'cash_only_session_balance' }
      return respond({ status: 'success', session })
    }
    if (url.pathname === '/game/sessions/303' && request.method() === 'DELETE') {
      mutations.push({ method: 'DELETE' })
      session = null
      return respond({ status: 'success', deleted_session_id: 303 })
    }
    if (url.pathname === '/game/sessions/303') return session ? respond({ session }) : respond({ detail: 'Session not found' }, 404)
    if (url.pathname === '/game/sessions/303/status') return respond({ ...session, days_elapsed: 0, days_remaining: 21 })
    if (url.pathname === '/game/sessions/303/analytics/performance') return respond({ starting_value: 3_000_000, current_value: 3_000_000, total_return: 0, total_return_pct: 0, snapshots: [] })
    return respond({ detail: `Unhandled onboarding request: ${request.method()} ${url.pathname}` }, 500)
  })

  await page.goto('/register')
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm Password', { exact: true }).fill('mismatch')
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.')
  expect(authRequests).toHaveLength(0)
  await page.getByLabel('Confirm Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Register', exact: true }).click()
  await expect(page).toHaveURL(/\/games$/)
  await expect(page.locator('.game-session-card')).toHaveCount(0)
  await page.locator('.games-create-btn').click()
  const setup = page.getByRole('dialog', { name: 'Game setup' })
  await setup.getByRole('textbox', { name: 'Game name', exact: true }).fill('Focused game')
  await setup.locator('.game-option-section').nth(0).getByRole('button', { name: 'Custom', exact: true }).click()
  await setup.getByRole('textbox', { name: 'Custom starting cash' }).fill('3,000,000')
  await setup.locator('.game-option-section').nth(1).getByRole('button', { name: 'Custom', exact: true }).click()
  await setup.getByRole('textbox', { name: 'Custom duration' }).fill('21')
  await setup.getByRole('button', { name: 'Start game', exact: true }).click()
  await expect(page).toHaveURL(/\/games\/303$/)
  await expect(page.locator('.sidebar-game-context')).toContainText('Focused game')
  expect(mutations).toEqual([{ method: 'POST', payload: { title: 'Focused game', starting_balance_krw: 3_000_000, duration_days: 21 } }])

  await page.locator('.app-sidebar').getByRole('link', { name: 'My Games', exact: true }).click()
  await page.getByRole('button', { name: 'Manage Focused game', exact: true }).click()
  const management = page.getByRole('dialog', { name: 'Game Management' })
  await management.getByRole('textbox', { name: 'Game name', exact: true }).fill('Renamed review')
  await management.getByRole('button', { name: 'Save name' }).click()
  await expect(management).toBeHidden()
  await expect(page.locator('.game-session-card')).toContainText('Renamed review')
  expect(mutations[1]).toEqual({ method: 'PATCH', payload: { title: 'Renamed review' } })
  await page.getByRole('button', { name: 'Manage Renamed review', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive game' }).click()
  const archive = page.getByRole('dialog', { name: 'Archive this game?' })
  await archive.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(mutations).toHaveLength(2)
  await page.getByRole('button', { name: 'Manage Renamed review', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive game' }).click()
  await page.getByRole('dialog', { name: 'Archive this game?' }).getByRole('button', { name: 'Archive game' }).click()
  await expect(page.locator('.game-session-card-history')).toContainText('Renamed review')
  expect(mutations[2]).toEqual({ method: 'PATCH', payload: { status: 'archived' } })

  await page.getByRole('button', { name: 'Manage Renamed review', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click()
  const deletion = page.getByRole('dialog', { name: 'Delete this game permanently?' })
  const remove = deletion.getByRole('button', { name: 'Delete permanently', exact: true })
  await expect(remove).toBeDisabled()
  await deletion.getByPlaceholder('DELETE', { exact: true }).fill('delete')
  await expect(remove).toBeDisabled()
  await deletion.getByPlaceholder('DELETE', { exact: true }).fill('DELETE')
  await remove.click()
  await expect(page.locator('.game-session-card')).toHaveCount(0)
  await expect(page).toHaveURL(/\/games$/)
  expect(mutations[3]).toEqual({ method: 'DELETE' })
  expect(listQueries.every((value) => value === 'true')).toBe(true)

  await page.locator('.app-sidebar').getByRole('button', { name: 'Log Out' }).click()
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log In', exact: true }).click()
  await expect(page).toHaveURL(/\/games$/)
  await expect(page.locator('.game-session-card')).toHaveCount(0)
  expect(authRequests.map((request) => request.path)).toEqual(['/auth/register', '/auth/login', '/auth/login'])
  expect(authRequests.every((request) => request.authorization === undefined)).toBe(true)
})

