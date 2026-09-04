import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUp(page: Page, name: string) {
  const email = `asg-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  return email
}

/**
 * Radix marks the rest of the page `aria-hidden` while a modal is open, so anything
 * asserted about the accessibility tree must wait for the dialog to actually close — not
 * merely for Escape to be sent. An accessible name read a moment too early is "".
 */
async function closeDialog(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function addTask(page: Page, title: string) {
  await page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill(title)
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: title })).toBeVisible()
}

test('a team member can be assigned and unassigned, and it persists', async ({ page }) => {
  await signUp(page, 'Ada Lovelace')
  await addTask(page, 'Needs an owner')

  await page.getByTestId('task-card').click()
  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('menuitem', { name: 'Assign Ada Lovelace' }).click()
  await page.waitForTimeout(400)
  await closeDialog(page)

  // The card shows the assignee as initials (photographs are a declined scope question),
  // and the whole card announces the assignment as part of its own accessible name.
  const card = page.getByTestId('task-card').filter({ hasText: 'Needs an owner' })
  await expect(card.getByTestId('avatar-stack')).toBeVisible()
  // The names are carried on the stack itself. Asserting them here rather than on the
  // card's composed accessible name: whether Chromium folds a nested aria-label into an
  // ancestor button's name is a browser detail, but the label being present is the
  // requirement — initials alone would tell a screen reader nothing.
  await expect(card.getByTestId('avatar-stack')).toHaveAttribute('aria-label', /Assigned to Ada Lovelace/)

  await page.reload()
  await expect(page.getByTestId('task-card').filter({ hasText: 'Needs an owner' })
    .getByTestId('avatar-stack')).toBeVisible()

  // Unassign
  await page.getByTestId('task-card').click()
  await page.getByRole('button', { name: '1 assigned' }).click()
  await page.getByRole('menuitem', { name: 'Unassign Ada Lovelace' }).click()
  await page.waitForTimeout(400)
  await closeDialog(page)
  await expect(page.getByTestId('task-card').getByTestId('avatar-stack')).toHaveCount(0)
})

test('the picker offers ONLY members of the board’s team (I4)', async ({ browser }) => {
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await signUp(otherPage, 'Outsider Person')

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signUp(page, 'Team Owner')
  await addTask(page, 'Scoped picker')

  await page.getByTestId('task-card').click()
  await page.getByRole('button', { name: 'Assign' }).click()

  await expect(page.getByRole('menuitem', { name: /Team Owner/ })).toHaveCount(1)
  // Someone in a different team is not offered — the UI cannot present a person the
  // server would reject.
  await expect(page.getByRole('menuitem', { name: /Outsider Person/ })).toHaveCount(0)

  await other.close(); await ctx.close()
})

test('removing someone from the team clears their assignments but keeps the task (SC9)', async ({ browser }) => {
  const memberCtx = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  const memberEmail = await signUp(memberPage, 'Grace Hopper')

  const ownerCtx = await browser.newContext()
  const page = await ownerCtx.newPage()
  await signUp(page, 'Team Owner')
  const boardUrl = page.url()

  // Navigation is proven in teams.spec.ts; this test navigates by URL so it stays about
  // SC9 rather than re-testing the menu on every step.
  await page.getByRole('link', { name: 'Team settings' }).click()
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/settings$/)
  const settingsUrl = page.url()

  await page.getByLabel('Email address').fill(memberEmail)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByTestId('member-row')).toHaveCount(2)

  // Assign them to a task.
  await page.goto(boardUrl)
  await addTask(page, 'Assigned then orphaned')
  await page.getByTestId('task-card').click()
  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('menuitem', { name: 'Assign Grace Hopper' }).click()
  await page.waitForTimeout(400)
  await closeDialog(page)
  await expect(page.getByTestId('task-card').getByTestId('avatar-stack'))
    .toHaveAttribute('aria-label', /Grace Hopper/)

  // Remove them from the team.
  await page.goto(settingsUrl)
  await page.getByRole('button', { name: 'Remove Grace Hopper' }).click()
  await expect(page.getByTestId('member-row')).toHaveCount(1)

  await page.goto(boardUrl)
  // SC9: the assignment is gone, the task survives.
  await expect(page.getByTestId('task-card').filter({ hasText: 'Assigned then orphaned' })).toBeVisible()
  await expect(page.getByTestId('task-card').getByTestId('avatar-stack')).toHaveCount(0)

  await memberCtx.close(); await ownerCtx.close()
})
