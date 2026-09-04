import { test, expect, type Page, type BrowserContext } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const PASSWORD = 'a-perfectly-fine-password'

async function signUp(page: Page, name = 'Team Person') {
  const email = `team-${unique()}@example.test`
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
  return email
}

/**
 * Reaches team settings the way a person does — through the link on the board — rather than
 * by asking the API for a team id. Navigating like a user is also what proves the page is
 * REACHABLE, which is its own requirement: this page existed with nothing linking to it.
 */
async function gotoSettings(page: Page) {
  await page.getByRole('link', { name: 'Team settings' }).click()
  await page.waitForURL(/\/teams\/[0-9a-f-]+\/settings$/)
  return page.url()
}

test('an owner adds an existing account by email (SC7)', async ({ browser }) => {
  const invitee = await browser.newContext()
  const inviteePage = await invitee.newPage()
  const inviteeEmail = await signUp(inviteePage, 'Invitee Person')

  const owner = await browser.newContext()
  const ownerPage = await owner.newPage()
  await signUp(ownerPage, 'Owner Person')
  await gotoSettings(ownerPage)

  await expect(ownerPage.getByTestId('member-row')).toHaveCount(1)
  await ownerPage.getByLabel('Email address').fill(inviteeEmail)
  await ownerPage.getByRole('button', { name: 'Add' }).click()

  await expect(ownerPage.getByTestId('member-row')).toHaveCount(2)
  await expect(ownerPage.getByText('Invitee Person')).toBeVisible()

  await invitee.close(); await owner.close()
})

test('a miss says so explicitly and never silently succeeds (SC7)', async ({ page }) => {
  await signUp(page)
  await gotoSettings(page)

  await page.getByLabel('Email address').fill(`nobody-${unique()}@example.test`)
  await page.getByRole('button', { name: 'Add' }).click()

  const error = page.getByTestId('add-member-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('No account with that email')
  // ...and tells them what to do about it, since invitations do not exist.
  await expect(error).toContainText('sign up')
  await expect(page.getByTestId('member-row')).toHaveCount(1)
})

test('the only owner cannot be removed or demoted (I6)', async ({ page }) => {
  await signUp(page)
  await gotoSettings(page)

  // The consequence is stated where it applies, rather than only on failure.
  await expect(page.getByText(/only owner/i)).toBeVisible()

  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /^Remove/ }).click()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('member-row')).toHaveCount(1)
})

test('owner-only controls are HIDDEN from a member, not merely disabled (design.md)', async ({ browser }) => {
  const memberCtx: BrowserContext = await browser.newContext()
  const memberPage = await memberCtx.newPage()
  const memberEmail = await signUp(memberPage, 'Plain Member')

  const ownerCtx = await browser.newContext()
  const ownerPage = await ownerCtx.newPage()
  await signUp(ownerPage, 'The Owner')
  const url = await gotoSettings(ownerPage)
  await ownerPage.getByLabel('Email address').fill(memberEmail)
  await ownerPage.getByRole('button', { name: 'Add' }).click()
  await expect(ownerPage.getByTestId('member-row')).toHaveCount(2)

  // The member can see the team, but none of the owner controls exist in their DOM.
  await memberPage.goto(url)
  await expect(memberPage.getByTestId('member-row')).toHaveCount(2)
  await expect(memberPage.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  await expect(memberPage.getByRole('button', { name: 'Delete team' })).toHaveCount(0)
  await expect(memberPage.getByLabel('Email address')).toHaveCount(0)
  await expect(memberPage.getByLabel('Team name')).toHaveCount(0)

  await memberCtx.close(); await ownerCtx.close()
})

test('an outsider cannot open a team settings page at all (SC5)', async ({ browser }) => {
  const a = await browser.newContext(); const pa = await a.newPage()
  await signUp(pa, 'Victim'); const url = await gotoSettings(pa)

  const b = await browser.newContext(); const pb = await b.newPage()
  await signUp(pb, 'Stranger')
  const res = await pb.goto(url)
  expect(res?.status()).toBe(404)
  // And the body carries none of the team's content.
  expect(await pb.content()).not.toContain('Victim')

  await a.close(); await b.close()
})
