import { test, expect } from '@playwright/test'

/**
 * T01 acceptance #4 — proves the e2e runner boots the real production server and can
 * reach it. Kept deliberately thin: T04 onwards add the flows that matter.
 */
test('the production server answers the health probe from the database', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  await expect(res.json()).resolves.toMatchObject({ database: 'reachable' })
})

test('the app shell renders', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
})
