import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUp(page: Page, name: string) {
  const email = `cmt-${unique()}@example.test`
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

async function comment(page: Page, text: string) {
  await page.getByLabel('Write a comment').fill(text)
  await page.getByRole('button', { name: 'Post' }).click()
  await expect(page.getByTestId('comment').filter({ hasText: text })).toBeVisible()
}

test('a comment can be posted and the card count updates', async ({ page }) => {
  await signUp(page, 'Commenter')
  await addTask(page, 'Discuss me')
  await page.getByTestId('task-card').click()
  await comment(page, 'First thought')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The board payload carries counts, so the card must reflect the new comment.
  await expect(page.getByTestId('task-card').filter({ hasText: 'Discuss me' })).toContainText('1')
})

test('comments render as TEXT — markup is shown, never interpreted', async ({ page }) => {
  await signUp(page, 'Commenter')
  await addTask(page, 'Injection check')
  await page.getByTestId('task-card').click()

  const payload = '<b>bold?</b> <img src=x onerror=alert(1)>'
  await comment(page, payload)

  // The characters are visible as typed...
  await expect(page.getByTestId('comment')).toContainText('<b>bold?</b>')
  // ...and nothing was parsed into real elements.
  const injected = await page.evaluate(() =>
    document.querySelectorAll('[data-testid="comment"] b, [data-testid="comment"] img').length)
  expect(injected).toBe(0)
})

test('the author can delete their own comment', async ({ page }) => {
  await signUp(page, 'Author Person')
  await addTask(page, 'Deletable')
  await page.getByTestId('task-card').click()
  await comment(page, 'Mine to remove')

  await page.getByRole('button', { name: 'Delete comment by Author Person' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('comment')).toHaveCount(0)
})

test('a member who is neither author nor owner sees no delete control (SC6)', async ({ browser }) => {
  // Owner writes a comment; a plain member must not be able to remove it.
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

  await ownerPage.goto(owner.boardUrl)
  await addTask(ownerPage, 'Owner comment here')
  await ownerPage.getByTestId('task-card').click()
  await comment(ownerPage, 'Written by the owner')

  // The member opens the same task.
  await memberPage.goto(owner.boardUrl)
  await memberPage.getByTestId('task-card').filter({ hasText: 'Owner comment here' }).click()
  await expect(memberPage.getByTestId('comment')).toHaveCount(1)
  // No control at all — hidden, not disabled.
  await expect(memberPage.getByRole('button', { name: /^Delete comment by/ })).toHaveCount(0)

  await ownerCtx.close(); await memberCtx.close()
})

test('the team owner CAN delete someone else’s comment (SC6, allow half)', async ({ browser }) => {
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

  await ownerPage.goto(owner.boardUrl)
  await addTask(ownerPage, 'Member will comment')

  await memberPage.goto(owner.boardUrl)
  await memberPage.getByTestId('task-card').click()
  await comment(memberPage, 'Written by the member')

  await ownerPage.reload()
  await ownerPage.getByTestId('task-card').click()
  await ownerPage.getByRole('button', { name: 'Delete comment by Plain Member' }).click()
  await ownerPage.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(ownerPage.getByTestId('comment')).toHaveCount(0)

  await ownerCtx.close(); await memberCtx.close()
})
