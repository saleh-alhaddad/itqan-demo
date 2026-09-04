import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signUpToBoard(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Failure Person')
  await page.getByLabel('Email').fill(`fail-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  await expect(page.getByTestId('board-view')).toBeVisible()
}

/** Make the server refuse, exactly as the throttle or the origin check would. */
async function refuse(page: Page, pattern: string, status = 429, message = 'Too many attempts. Try again in 4 seconds.') {
  await page.route(pattern, (route) =>
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(route.request().method())
      ? route.fulfill({ status, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'TOO_MANY_ATTEMPTS', message } }) })
      : route.continue())
}

test('H1: a refused column rename SAYS SO and does not silently revert', async ({ page }) => {
  await signUpToBoard(page)
  await refuse(page, '**/api/columns/**')

  await page.getByRole('button', { name: 'Actions for To Do' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByLabel('Rename To Do').fill('Backlog')
  await page.getByLabel('Rename To Do').press('Enter')

  // The server's own message reaches the user, rather than the edit vanishing silently.
  await expect(page.getByText('Too many attempts. Try again in 4 seconds.')).toBeVisible()
})

test('H1: a refused task creation says so', async ({ page }) => {
  await signUpToBoard(page)
  await refuse(page, '**/api/columns/**', 403, 'This request did not come from this site.')

  await page.getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill('Will be refused')
  await page.getByLabel('New task in To Do').press('Enter')

  await expect(page.getByText('This request did not come from this site.')).toBeVisible()
  await expect(page.getByTestId('task-card')).toHaveCount(0)
})

test('H1: a refused keyboard move announces the failure, never the move', async ({ page }) => {
  await signUpToBoard(page)
  await page.getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill('Stuck')
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card')).toHaveCount(1)

  await refuse(page, '**/api/tasks/**')
  await page.getByRole('button', { name: 'Move “Stuck”' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()

  // Announcing a move that did not happen would tell a screen-reader user the card is
  // somewhere it is not.
  await expect(page.getByTestId('board-announcer')).toContainText('Could not move')
  await expect(page.getByTestId('board-announcer')).not.toContainText('Moved “Stuck” to Done')
})

test('H1: a refused sign-out does not pretend to have signed out', async ({ page }) => {
  await signUpToBoard(page)
  await refuse(page, '**/api/auth/logout', 500, 'Something went wrong.')

  await page.getByRole('button', { name: /Account menu for Failure Person/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()

  // Still on the board, and told why — rather than landing on /login while the session lives.
  await expect(page).not.toHaveURL(/\/login$/)
  await expect(page.getByText('Something went wrong.')).toBeVisible()
})

test('a successful mutation still works and raises no error toast', async ({ page }) => {
  await signUpToBoard(page)
  await page.getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill('Happy path')
  await page.getByLabel('New task in To Do').press('Enter')

  await expect(page.getByTestId('task-card').filter({ hasText: 'Happy path' })).toBeVisible()
  await expect(page.getByText(/did not work|Too many attempts|not come from this site/)).toHaveCount(0)
})
