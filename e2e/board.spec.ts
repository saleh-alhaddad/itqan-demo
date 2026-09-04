import { test, expect, type Page } from '@playwright/test'

/**
 * Closes the two acceptance criteria deferred from T04 and T05 (intake R5), plus T07's
 * own state and layout requirements from design.md.
 */

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signUp(page: Page) {
  const email = `e2e-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill('E2E Person')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  return email
}

test('SC1 — a new signup lands on a usable board with no setup step (T04 #1)', async ({ page }) => {
  await signUp(page)

  // The redirect goes straight to a board — never a wizard, never an empty state.
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)

  const columns = page.getByTestId('board-column')
  await expect(columns.first()).toBeVisible()
  await expect(columns).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'To Do' })).toBeVisible()
})

test('signed-out visitors are redirected to /login (T05 #3)', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/boards/00000000-0000-4000-8000-000000000000')
  await expect(page).toHaveURL(/\/login$/)
})

test('the login page offers no password reset, because none exists', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await expect(page.getByText(/forgot/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /reset/i })).toHaveCount(0)
})

/**
 * REGRESSION (SC5). An earlier version checked board access in the route's layout. Next
 * renders a layout and its page CONCURRENTLY, so the page loaded the board and serialised
 * it into the RSC flight payload even as the layout threw a 404 — the response carried a
 * 404 status AND the board's contents. Authorization now lives inside the query
 * (`loadBoardFor`), which cannot be bypassed by a call site.
 *
 * This asserts the RESPONSE BODY, not just the status: the status was already correct
 * while the data was leaking.
 */
test('a stranger\'s 404 contains none of the board\'s data (SC5 regression)', async ({ browser, request }) => {
  const a = await browser.newContext()
  const pageA = await a.newPage()
  await signUp(pageA)
  await pageA.waitForURL(/\/boards\/[0-9a-f-]+$/)
  const victimUrl = pageA.url()
  const victimBoardId = victimUrl.split('/').pop()!

  // Read the victim's board through their own session, so the test knows exactly which
  // strings must NOT appear in the stranger's response.
  const cookieHeader = (await a.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  const board = await (
    await request.get(`/api/boards/${victimBoardId}`, { headers: { cookie: cookieHeader } })
  ).json()
  const victimColumnName: string = board.columns[0].name

  const b = await browser.newContext()
  const pageB = await b.newPage()
  await signUp(pageB)
  await pageB.waitForURL(/\/boards\/[0-9a-f-]+$/)

  const res = await pageB.goto(victimUrl)
  expect(res?.status()).toBe(404)

  // Assert the BODY, not just the status: the status was already correct while the RSC
  // payload still carried the whole board.
  const html = await pageB.content()
  expect(html).not.toContain(victimColumnName)
  expect(html).not.toContain(board.name)
  expect(html).not.toContain(board.columns[0].id)

  await a.close()
  await b.close()
})

test('a signed-in stranger cannot see someone else\'s board (SC5)', async ({ browser }) => {
  // Person A makes a board.
  const a = await browser.newContext()
  const pageA = await a.newPage()
  await signUp(pageA)
  await pageA.waitForURL(/\/boards\/[0-9a-f-]+$/)
  const victimUrl = pageA.url()

  // Person B, signed in but unrelated, follows the exact same URL.
  const b = await browser.newContext()
  const pageB = await b.newPage()
  await signUp(pageB)
  await pageB.waitForURL(/\/boards\/[0-9a-f-]+$/)

  const res = await pageB.goto(victimUrl)
  expect(res?.status()).toBe(404)

  await a.close()
  await b.close()
})

test('empty columns say so quietly rather than showing nothing (design.md)', async ({ page }) => {
  await signUp(page)
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  // A brand-new board has three columns and no tasks.
  await expect(page.getByText('No tasks yet').first()).toBeVisible()
})

test('the page never scrolls in both directions at once (design.md)', async ({ page }) => {
  await signUp(page)
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  await expect(page.getByTestId('board-view')).toBeVisible()

  const bodyScrollsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(bodyScrollsHorizontally).toBe(false)

  // The horizontal scrolling lives in the column rail, not the document.
  const rail = page.getByTestId('board-view').locator('div.overflow-x-auto')
  await expect(rail).toHaveCount(1)
})

/**
 * REGRESSION. `globals.css` shipped `--font-sans: var(--font-sans)` — a self-referential
 * variable that resolved to nothing, so every surface silently fell back to the browser's
 * default serif. No functional test could see it; a screenshot did. This asserts the
 * variable actually resolves.
 */
test('the sans font stack actually resolves (no self-referential variable)', async ({ page }) => {
  await page.goto('/login')
  const fontVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim(),
  )
  expect(fontVar).not.toBe('')
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(bodyFont.toLowerCase()).not.toMatch(/^(times|serif)/)
})
