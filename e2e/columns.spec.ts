import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signUpToBoard(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Column Person')
  await page.getByLabel('Email').fill(`cols-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
}

test('a column can be added, renamed and deleted from the board', async ({ page }) => {
  await signUpToBoard(page)
  await expect(page.getByTestId('board-column')).toHaveCount(3)

  // Add
  await page.getByRole('button', { name: 'Add column' }).first().click()
  await page.getByLabel('New column name').fill('Blocked')
  await page.getByLabel('New column name').press('Enter')
  await expect(page.getByTestId('board-column')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: 'Blocked' })).toBeVisible()

  // Rename
  await page.getByRole('button', { name: 'Actions for Blocked' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByLabel('Rename Blocked').fill('On hold')
  await page.getByLabel('Rename Blocked').press('Enter')
  await expect(page.getByRole('heading', { name: 'On hold' })).toBeVisible()

  // Delete
  await page.getByRole('button', { name: 'Actions for On hold' }).click()
  await page.getByRole('menuitem', { name: 'Delete column' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('board-column')).toHaveCount(3)
})

test('the delete confirmation states that the column is empty', async ({ page }) => {
  await signUpToBoard(page)
  await page.getByRole('button', { name: 'Actions for To Do' }).click()
  await page.getByRole('menuitem', { name: 'Delete column' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('This column is empty.')
  // Irreversibility is stated every time — there is no undo (Q14).
  await expect(dialog).toContainText('This cannot be undone.')
})
