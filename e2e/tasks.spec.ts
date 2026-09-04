import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signUpToBoard(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Task Person')
  await page.getByLabel('Email').fill(`tasks-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
}

async function addTask(page: Page, column: string, title: string) {
  await page.getByRole('button', { name: `New task in ${column}` }).or(
    page.getByTestId('board-column').filter({ hasText: column }).getByRole('button', { name: 'Add a task' }),
  ).first().click()
  await page.getByLabel(`New task in ${column}`).fill(title)
  await page.getByLabel(`New task in ${column}`).press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: title })).toBeVisible()
}

test('a task can be created with a title alone', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Write the thing')
  await expect(page.getByTestId('task-card')).toHaveCount(1)
})

test('the detail dialog opens OVER the board, which stays mounted (design.md)', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Openable')

  await page.getByTestId('task-card').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // The board is still there behind it — this is a dialog, not a route change.
  await expect(page.getByTestId('board-view')).toBeVisible()
  await expect(page.getByTestId('board-column')).toHaveCount(3)
  expect(page.url()).toMatch(/\/boards\/[0-9a-f-]+$/)
})

test('focus is trapped in the dialog and RETURNS to the card on close (design.md)', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Focusable')

  const card = page.getByTestId('task-card').first()
  await card.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Focus moved into the dialog.
  const insideDialog = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  expect(insideDialog).toBe(true)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()

  // ...and came back to the card that opened it, so keyboard users do not lose their place.
  const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? '')
  expect(focusedText).toContain('Focusable')
})

test('a task can be edited and the change persists across a reload', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Before edit')

  await page.getByTestId('task-card').click()
  await page.getByLabel('Title').fill('After edit')
  await page.getByLabel('Description').fill('Some detail')
  await page.getByLabel('Description').blur()
  await page.keyboard.press('Escape')

  await page.reload()
  await expect(page.getByTestId('task-card').filter({ hasText: 'After edit' })).toBeVisible()
})

test('deleting a task requires confirmation and states it cannot be undone', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Doomed')

  await page.getByTestId('task-card').click()
  await page.getByRole('button', { name: 'Delete task' }).click()

  const confirm = page.getByRole('dialog').filter({ hasText: 'This cannot be undone.' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByTestId('task-card')).toHaveCount(0)
})

test('cards are reachable and openable by keyboard alone', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Keyboard reachable')

  await page.keyboard.press('Escape')
  const card = page.getByTestId('task-card').first()
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
})
