import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUp(page: Page, name: string) {
  const email = `bl-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  return { email, boardUrl: page.url() }
}

test('a member creates a board and lands on it with its default columns', async ({ page }) => {
  await signUp(page, 'Board Maker')
  await page.getByRole('link', { name: 'Boards' }).click()

  await page.getByRole('button', { name: 'New board' }).click()
  await page.getByLabel(/New board in/).fill('Q4 planning')
  await page.getByLabel(/New board in/).press('Enter')

  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: 'Q4 planning' })).toBeVisible()
  // Same starting state as signup produces — no setup step.
  await expect(page.getByTestId('board-column')).toHaveCount(3)
})

test('a board can be renamed, and the list reflects it', async ({ page }) => {
  await signUp(page, 'Renamer')
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Board name').fill('Renamed board')
  await page.getByLabel('Board name').press('Enter')
  await expect(page.getByRole('heading', { name: 'Renamed board' })).toBeVisible()

  await page.getByRole('link', { name: 'Boards' }).click()
  await expect(page.getByTestId('board-link').filter({ hasText: 'Renamed board' })).toBeVisible()
})

test('deleting a board states the cascade and returns to the list (I7)', async ({ page }) => {
  await signUp(page, 'Deleter')
  await page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill('Will be destroyed')
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card')).toHaveCount(1)

  await page.getByRole('button', { name: 'Delete board' }).click()
  const dialog = page.getByRole('dialog')
  // The number is stated, not implied.
  await expect(dialog).toContainText('1 task')
  await expect(dialog).toContainText('This cannot be undone.')
  await dialog.getByRole('button', { name: 'Delete board' }).click()

  await page.waitForURL(/\/boards$/)
  await expect(page.getByTestId('board-link')).toHaveCount(0)
})

test('a plain member sees no delete control for a board (SC6)', async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  const owner = await signUp(ownerPage, 'The Owner')

  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  const member = await signUp(memberPage, 'Plain Member')

  await ownerPage.getByRole('link', { name: 'Team settings' }).click()
  await ownerPage.getByLabel('Email address').fill(member.email)
  await ownerPage.getByRole('button', { name: 'Add' }).click()
  await expect(ownerPage.getByTestId('member-row')).toHaveCount(2)

  await memberPage.goto(owner.boardUrl)
  await expect(memberPage.getByTestId('board-view')).toBeVisible()
  // Rename is a member action; delete is not.
  await expect(memberPage.getByRole('button', { name: 'Rename' })).toHaveCount(1)
  await expect(memberPage.getByRole('button', { name: 'Delete board' })).toHaveCount(0)

  await ownerCtx.close(); await memberCtx.close()
})
