import { test, expect, type Page } from '@playwright/test'

/**
 * Where a RETURNING user lands.
 *
 * The whole suite signed up and followed the signup redirect to /boards/:id, so nothing
 * ever exercised the login redirect — which went to /boards, a route with no page. Every
 * successful login landed on a 404 while 24 e2e tests stayed green.
 */

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUpThenLogOut(page: Page) {
  const email = `login-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Returning Person')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  const boardUrl = page.url()

  // Leave the way a returning user would: session gone, account intact.
  await page.request.post('/api/auth/logout')
  await page.context().clearCookies()
  return { email, boardUrl }
}

async function logIn(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test('a returning user lands somewhere real after logging in — not a 404', async ({ page }) => {
  const { email } = await signUpThenLogOut(page)

  const responses: number[] = []
  page.on('response', (r) => { if (r.request().isNavigationRequest()) responses.push(r.status()) })

  await logIn(page, email)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  // The actual defect: the destination existed as a URL but not as a page.
  expect(responses).not.toContain(404)
  await expect(page.getByText(/404|not found|could not be found/i)).toHaveCount(0)
})

test('a returning user can reach their existing board after logging in', async ({ page }) => {
  const { email } = await signUpThenLogOut(page)
  await logIn(page, email)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  // Their board from signup is still theirs, and reachable from where login put them.
  await expect(page.getByText('My Board')).toBeVisible()
})

test('the board a returning user had before logging out is still there', async ({ page }) => {
  const { email, boardUrl } = await signUpThenLogOut(page)
  await logIn(page, email)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  const res = await page.goto(boardUrl)
  expect(res?.status()).toBe(200)
  await expect(page.getByTestId('board-column')).toHaveCount(3)
})
