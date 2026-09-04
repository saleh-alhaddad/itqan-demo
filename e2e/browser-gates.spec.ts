import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Console is attached BEFORE the first navigation, or early errors are missed. */
function watchConsole(page: Page) {
  const errors: string[] = []
  const warnings: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(m.text())
    if (m.type() === 'warning') warnings.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return { errors, warnings }
}

async function signUpToBoard(page: Page, name = 'Gate Person') {
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(`gate-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
}

/**
 * The console-clean gate. An error during an exercised flow fails verification; warnings are
 * reported as findings rather than ignored.
 */
test('the whole core flow runs with ZERO console errors', async ({ page }) => {
  const { errors, warnings } = watchConsole(page)

  await signUpToBoard(page)

  // Column: add, rename
  await page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill('Console check')
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card')).toHaveCount(1)

  // Task dialog: edit, due date, assign, comment
  await page.getByTestId('task-card').click()
  await page.getByLabel('Title').fill('Console check edited')
  await page.getByLabel('Description').fill('Some detail')
  await page.getByLabel('Description').blur()
  await page.getByRole('button', { name: 'Assign' }).click()
  await page.getByRole('menuitem', { name: /Assign Gate Person/ }).click()
  await page.waitForTimeout(300)
  // The assignee menu stays open after a selection, deliberately, so several people can be
  // picked in one go. Close it before reaching past it.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.getByLabel('Write a comment').fill('A comment')
  await page.getByRole('button', { name: 'Post' }).click()
  await expect(page.getByTestId('comment')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Move, then navigate the whole app
  await page.getByRole('button', { name: /^Move/ }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('link', { name: 'Team settings' }).click()
  await page.waitForURL(/settings$/)
  await page.getByRole('link', { name: 'Boards' }).click()
  await page.waitForURL(/\/boards$/)
  await page.getByTestId('board-link').click()
  await expect(page.getByTestId('board-view')).toBeVisible()

  expect(errors, `console errors during the core flow:\n${errors.join('\n')}`).toEqual([])
  // Warnings are findings, not noise to ignore — surfaced by failing loudly if any appear.
  expect(warnings, `console warnings (findings):\n${warnings.join('\n')}`).toEqual([])
})

test('the signup and login pages load with zero console errors', async ({ page }) => {
  const { errors } = watchConsole(page)
  await page.goto('/signup')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

/**
 * a11y proven from the accessibility tree, not from pixels: every interactive control in the
 * exercised surface must have a role and an accessible name.
 */
test('every interactive control on the board has a role and an accessible name', async ({ page }) => {
  await signUpToBoard(page)
  await page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill('Named control check')
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card')).toHaveCount(1)

  const { unnamed, examined } = await page.evaluate(() => {
    const out: string[] = []
    let seen = 0
    const interactive = document.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="link"]',
    )
    for (const el of interactive) {
      if (el.closest('[aria-hidden="true"]') || el.getAttribute('aria-hidden') === 'true') continue
      if (el.tabIndex < 0) continue
      seen++
      const name = (
        el.getAttribute('aria-label') ??
        (el.getAttribute('aria-labelledby')
          ? document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent
          : null) ??
        (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
        el.textContent ??
        (el as HTMLInputElement).placeholder ??
        ''
      ).trim()
      if (!name) out.push(`${el.tagName.toLowerCase()}.${el.className.split(' ')[0] || '(no class)'}`)
    }
    return { unnamed: out, examined: seen }
  })

  // Read the COUNT, not just the outcome: an empty set produces no unnamed elements and
  // would pass while proving nothing. This assertion is what makes the next one mean something.
  expect(examined, 'the probe found no interactive elements — it would pass vacuously').toBeGreaterThan(8)
  expect(unnamed, `interactive elements with no accessible name:\n  ${unnamed.join('\n  ')}`).toEqual([])
})

test('the board is completable by keyboard alone, and focus order follows the DOM', async ({ page }) => {
  await signUpToBoard(page)
  // waitForURL resolves on navigation, not on content: probing before the board renders
  // reports zero focusable elements, which reads as a catastrophic a11y failure rather
  // than a race.
  await expect(page.getByTestId('board-view')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a task to To Do' })).toBeVisible()

  // Headless Chromium will not Tab out of <body>, so start from a real control. This is a
  // harness constraint, not a property of the page: focus and Tab both work from here on.
  await page.getByRole('link', { name: 'Boards' }).focus()

  const order: string[] = []
  for (let i = 0; i < 30; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return '(no focus)'
      // Never fall back to textContent on a container: on <body> that is the whole page,
      // including inline script payloads, which makes a failure unreadable.
      const name = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40)
      return `${el.tagName.toLowerCase()}: ${name}`
    })
    order.push(label)
    if (label.includes('Add a task to To Do')) break
    await page.keyboard.press('Tab')
  }

  expect(order.some((l) => l.includes('Add a task to To Do')),
    `tab order never reached the add control. Reached:\n  ${order.join('\n  ')}`).toBe(true)
  expect(order.every((l) => l !== '(no focus)'),
    `focus was lost mid-traversal — a keyboard user would be stranded:\n  ${order.join('\n  ')}`).toBe(true)

  // The control reached by keyboard actually works by keyboard.
  await page.keyboard.press('Enter')
  await page.getByLabel('New task in To Do').fill('Made by keyboard')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: 'Made by keyboard' })).toBeVisible()
})

test('harden I1: the root route leads into the app, not a framework starter page', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/')
  // Signed out, the root should end at the login page — never at a page telling the visitor
  // to edit page.tsx.
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText(/get started, edit|Deploy Now/i)).toHaveCount(0)
})

test('harden I2: the framework is not advertised in response headers', async ({ request }) => {
  const res = await request.get('/login')
  expect(res.headers()['x-powered-by']).toBeUndefined()
})
