import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Local calendar day offsets, matching how the classifier reads "today". */
function localDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function signUpToBoard(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Due Person')
  await page.getByLabel('Email').fill(`due-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
}

async function addTask(page: Page, title: string) {
  await page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByRole('button', { name: 'Add a task to To Do' }).click()
  await page.getByLabel('New task in To Do').fill(title)
  await page.getByLabel('New task in To Do').press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: title })).toBeVisible()
}

async function setDue(page: Page, title: string, date: string) {
  await page.getByTestId('task-card').filter({ hasText: title }).click()
  await page.getByLabel('Due date').fill(date)
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

/** SC4: the rendered badge for each case. */
test('the badge reads overdue / due-soon / neither for the right dates (SC4)', async ({ page }) => {
  await signUpToBoard(page)

  for (const [title, offset, expected] of [
    ['Yesterday task', -1, 'overdue'],
    ['Today task', 0, 'due-soon'],
    ['Plus one task', 1, 'due-soon'],
    ['Plus two task', 2, 'due-soon'],
    ['Plus three task', 3, 'none'],
  ] as const) {
    await addTask(page, title)
    await setDue(page, title, localDay(offset))
    const badge = page.getByTestId('task-card').filter({ hasText: title }).getByTestId('due-badge')
    await expect(badge, `${title} (${offset >= 0 ? '+' : ''}${offset}d)`).toHaveAttribute('data-due-state', expected)
  }
})

test('a task with no due date renders no badge at all (SC4)', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'Undated')
  await expect(page.getByTestId('task-card').filter({ hasText: 'Undated' })
    .getByTestId('due-badge')).toHaveCount(0)
})

test('a due date can be SET and then CLEARED (SC4)', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'Clearable')
  await setDue(page, 'Clearable', localDay(1))

  const card = page.getByTestId('task-card').filter({ hasText: 'Clearable' })
  await expect(card.getByTestId('due-badge')).toHaveCount(1)

  await card.click()
  await page.getByRole('button', { name: 'Clear due date' }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')

  await expect(card.getByTestId('due-badge')).toHaveCount(0)
  // And it is really gone, not merely hidden.
  await page.reload()
  await expect(page.getByTestId('task-card').filter({ hasText: 'Clearable' })
    .getByTestId('due-badge')).toHaveCount(0)
})

test('the badge never relies on colour alone — it carries text and a per-state icon', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'Overdue one')
  await setDue(page, 'Overdue one', localDay(-1))
  await addTask(page, 'Soon one')
  await setDue(page, 'Soon one', localDay(1))

  const overdue = page.getByTestId('task-card').filter({ hasText: 'Overdue one' }).getByTestId('due-badge')
  const soon = page.getByTestId('task-card').filter({ hasText: 'Soon one' }).getByTestId('due-badge')

  // Text states the case, so greyscale loses nothing.
  await expect(overdue).toContainText('Overdue')
  await expect(soon).toContainText('Due tomorrow')

  // And the icons differ, so the two are distinguishable without reading.
  const icons = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="due-badge"]')].map(
      (b) => b.querySelector('svg')?.getAttribute('class') ?? '',
    ),
  )
  expect(new Set(icons).size).toBeGreaterThan(1)
})

test('badge colours clear 4.5:1 against the tinted card they sit on', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'Contrast check')
  await setDue(page, 'Contrast check', localDay(-1))

  const ratio = await page.evaluate(() => {
    const px = (c: string) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1
      const ctx = cv.getContext('2d')!
      ctx.fillStyle = '#000'; ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2]] as [number, number, number]
    }
    const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    const lum = (r: [number, number, number]) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2])

    const badge = document.querySelector('[data-testid="due-badge"]') as HTMLElement
    const shell = badge.closest('[data-testid="task-card-shell"]') as HTMLElement
    const a = lum(px(getComputedStyle(badge).color))
    const b = lum(px(getComputedStyle(shell).backgroundColor))
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })

  expect(ratio).toBeGreaterThanOrEqual(4.5)
})
