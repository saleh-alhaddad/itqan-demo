import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUp(page: Page, name = 'Signed In') {
  const email = `so-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  return email
}

test('a user can sign out — there was previously no way to at all', async ({ page }) => {
  await signUp(page, 'Ada Lovelace')
  await page.getByRole('button', { name: /Account menu for Ada Lovelace/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await page.waitForURL(/\/login$/)

  // The session is really gone, not just navigated away from.
  await page.goto('/boards')
  await expect(page).toHaveURL(/\/login$/)
})

test('harden M4: sign out everywhere revokes OTHER devices too', async ({ browser }) => {
  const email = `all-${unique()}@example.test`

  // Two browsers, same account — two independent sessions.
  const first = await browser.newContext()
  const p1 = await first.newPage()
  await p1.goto('/signup')
  await p1.getByLabel('Name').fill('Grace Hopper')
  await p1.getByLabel('Email').fill(email)
  await p1.getByLabel('Password').fill(PASSWORD)
  await p1.getByRole('button', { name: 'Create account' }).click()
  await p1.waitForURL(/\/boards\/[0-9a-f-]+$/)

  const second = await browser.newContext()
  const p2 = await second.newPage()
  await p2.goto('/login')
  await p2.getByLabel('Email').fill(email)
  await p2.getByLabel('Password').fill(PASSWORD)
  await p2.getByRole('button', { name: 'Log in' }).click()
  await p2.waitForURL(/\/boards$/)
  await expect(p2.getByRole('heading', { name: 'Your boards' })).toBeVisible()

  // Device one signs out everywhere.
  await p1.getByRole('button', { name: /Account menu for Grace Hopper/ }).click()
  await p1.getByRole('menuitem', { name: 'Sign out everywhere' }).click()
  const dialog = p1.getByRole('dialog')
  await expect(dialog).toContainText('Every browser and device')
  await dialog.getByRole('button', { name: 'Sign out everywhere' }).click()
  await p1.waitForURL(/\/login$/)

  // Device two is now signed out as well — that is the whole point.
  await p2.goto('/boards')
  await expect(p2).toHaveURL(/\/login$/)

  await first.close(); await second.close()
})

test('a plain sign out leaves other devices alone', async ({ browser }) => {
  const email = `one-${unique()}@example.test`
  const a = await browser.newContext(); const p1 = await a.newPage()
  await p1.goto('/signup')
  await p1.getByLabel('Name').fill('Solo Person')
  await p1.getByLabel('Email').fill(email)
  await p1.getByLabel('Password').fill(PASSWORD)
  await p1.getByRole('button', { name: 'Create account' }).click()
  await p1.waitForURL(/\/boards\/[0-9a-f-]+$/)

  const b = await browser.newContext(); const p2 = await b.newPage()
  await p2.goto('/login')
  await p2.getByLabel('Email').fill(email)
  await p2.getByLabel('Password').fill(PASSWORD)
  await p2.getByRole('button', { name: 'Log in' }).click()
  await p2.waitForURL(/\/boards$/)

  await p1.getByRole('button', { name: /Account menu for Solo Person/ }).click()
  await p1.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await p1.waitForURL(/\/login$/)

  // The other device is untouched — signing out here is not signing out everywhere.
  await p2.goto('/boards')
  await expect(p2.getByRole('heading', { name: 'Your boards' })).toBeVisible()

  await a.close(); await b.close()
})

test('harden M1: the security headers are actually served', async ({ request }) => {
  const res = await request.get('/login')
  const h = res.headers()
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['strict-transport-security']).toContain('max-age=')
  expect(h['permissions-policy']).toContain('camera=()')
  expect(h['x-powered-by']).toBeUndefined()
})
