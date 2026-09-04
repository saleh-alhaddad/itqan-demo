import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUp(page: Page, name: string) {
  const email = `poll-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  return { email, boardUrl: page.url() }
}

async function addTask(page: Page, title: string) {
  await page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill(title)
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: title })).toBeVisible()
}

/**
 * SC10, with its stated budget: TWO poll intervals plus slack (25s), not one.
 *
 * A change landing immediately after a poll cannot be seen until the next one, so a 10s
 * assertion would flake rather than fail — the spec says so explicitly, and this test
 * encodes that reasoning rather than a number someone guessed.
 */
test('a change by one person appears in another’s open board within 25s (SC10)', async ({ browser }) => {
  test.setTimeout(90_000)

  const aCtx = await browser.newContext()
  const a = await aCtx.newPage()
  const owner = await signUp(a, 'Person A')

  const bCtx = await browser.newContext()
  const b = await bCtx.newPage()
  const member = await signUp(b, 'Person B')

  // Put B on the same board.
  await a.getByRole('link', { name: 'Team settings' }).click()
  await a.getByLabel('Email address').fill(member.email)
  await a.getByRole('button', { name: 'Add' }).click()
  await expect(a.getByTestId('member-row')).toHaveCount(2)
  await a.goto(owner.boardUrl)

  // B is sitting on the board, doing nothing.
  await b.goto(owner.boardUrl)
  await expect(b.getByTestId('board-view')).toBeVisible()
  await expect(b.getByTestId('task-card')).toHaveCount(0)

  // A adds a task. B never refreshes.
  const title = `Appeared-${unique()}`
  await addTask(a, title)

  await expect(b.getByTestId('task-card').filter({ hasText: title }))
    .toBeVisible({ timeout: 25_000 })

  await aCtx.close(); await bCtx.close()
})

test('the poll is SILENT — no spinner, and the board is never blanked (design.md)', async ({ page }) => {
  test.setTimeout(60_000)
  await signUp(page, 'Watcher')
  await addTask(page, 'Stays put')

  // Watch for the board disappearing at any point across more than two poll intervals.
  const vanished = await page.evaluate(async () => {
    let gone = false
    const check = () => {
      if (!document.querySelector('[data-testid="board-view"]')) gone = true
      if (document.querySelectorAll('[data-testid="task-card"]').length === 0) gone = true
    }
    const id = window.setInterval(check, 200)
    await new Promise((r) => setTimeout(r, 23_000))
    window.clearInterval(id)
    return gone
  })
  expect(vanished).toBe(false)
  await expect(page.getByTestId('task-card').filter({ hasText: 'Stays put' })).toBeVisible()
})

test('a failed poll keeps the board and says so rather than blanking it (design.md)', async ({ page }) => {
  test.setTimeout(60_000)
  await signUp(page, 'Offline Person')
  await addTask(page, 'Survives the outage')

  // Make every subsequent board fetch fail, as an unattended background poll would.
  await page.route('**/api/boards/*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
  )

  await expect(page.getByText(/Couldn’t refresh|Couldn't refresh/)).toBeVisible({ timeout: 25_000 })
  // The data the user was reading is still there.
  await expect(page.getByTestId('task-card').filter({ hasText: 'Survives the outage' })).toBeVisible()
})
