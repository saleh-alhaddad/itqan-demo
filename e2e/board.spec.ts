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
