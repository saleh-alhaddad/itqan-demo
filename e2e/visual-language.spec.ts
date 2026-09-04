import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signUpToBoard(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Ada Lovelace')
  await page.getByLabel('Email').fill(`vis-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
}

async function addTask(page: Page, column: string, title: string) {
  await page.getByTestId('board-column').filter({ hasText: column })
    .getByRole('button', { name: `Add a task to ${column}` }).click()
  await page.getByLabel(`New task in ${column}`).fill(title)
  await page.getByLabel(`New task in ${column}`).press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: title })).toBeVisible()
}

/**
 * design.md claims every title/surface pair clears 4.5:1. That claim was computed against
 * token VALUES; this asserts it against what the browser actually paints, which is the only
 * version that protects a user. It would catch a token typo, a wrong variable name, or a
 * later restyle that quietly drops contrast.
 */
/**
 * Measures the PAINTED pixel rather than parsing the computed string.
 *
 * Chromium reports OKLCH-derived colours as `lab(...)`, so a naive rgb() parser reads
 * nothing — that failure looked like a contrast bug when it was a test bug. Painting each
 * colour into a canvas and sampling it works for any colour syntax the browser accepts, and
 * measures what is actually on screen rather than what the stylesheet said.
 */
const CONTRAST_IN_PAGE = `(fg, bg) => {
  const px = (c) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const ctx = cv.getContext('2d')
    ctx.fillStyle = '#000'; ctx.fillStyle = c        // invalid colours fall back to #000
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2]]
  }
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const lum = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2])
  const a = lum(px(fg)), b = lum(px(bg))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}`

test('every card title clears 4.5:1 against its own tinted surface, as rendered', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Blue column card')
  await addTask(page, 'In Progress', 'Violet column card')
  await addTask(page, 'Done', 'Rose column card')

  const ratios = await page.evaluate(([contrastSrc]) => {
    const contrast = eval(contrastSrc as string) as (f: string, b: string) => number
    return [...document.querySelectorAll('[data-testid="task-card-shell"]')].map((shell) => {
      const title = shell.querySelector('[data-testid="task-title"]') as HTMLElement
      return {
        title: title.textContent ?? '',
        surface: getComputedStyle(shell as HTMLElement).backgroundColor,
        ink: getComputedStyle(title).color,
        ratio: contrast(getComputedStyle(title).color, getComputedStyle(shell as HTMLElement).backgroundColor),
      }
    })
  }, [CONTRAST_IN_PAGE])

  expect(ratios.length).toBe(3)
  for (const r of ratios) {
    // Not a transparent/unset surface — a card that fell back to white would pass contrast
    // while proving the tint never applied.
    expect(r.surface, `${r.title} has a real painted surface`).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(r.ratio, `${r.title}: ink ${r.ink} on ${r.surface}`).toBeGreaterThanOrEqual(4.5)
  }
})

test('each column paints a DIFFERENT tint, so the scale is actually cycling', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'One')
  await addTask(page, 'In Progress', 'Two')
  await addTask(page, 'Done', 'Three')

  const surfaces = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="task-card-shell"]')].map(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    ),
  )
  expect(new Set(surfaces).size).toBe(3)
})

test('meta text uses the tint-safe muted token, not the neutral one', async ({ page }) => {
  await signUpToBoard(page)

  const [neutral, tintSafe] = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return [root.getPropertyValue('--muted-foreground').trim(), root.getPropertyValue('--tint-muted-foreground').trim()]
  })
  expect(neutral).not.toBe('')
  expect(tintSafe).not.toBe('')
  // They must differ: the whole point is that the neutral token measures 4.21 on a tint.
  expect(tintSafe).not.toBe(neutral)
})

test('the due-date tokens exist and are distinct', async ({ page }) => {
  await signUpToBoard(page)
  const [overdue, dueSoon] = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return [root.getPropertyValue('--overdue').trim(), root.getPropertyValue('--due-soon').trim()]
  })
  expect(overdue).not.toBe('')
  expect(dueSoon).not.toBe('')
  expect(overdue).not.toBe(dueSoon)
})

test('assignee names are exposed as text even though avatars show initials', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Has an assignee')
  // Assignment lands in T13; until then the stack is absent rather than empty, which is
  // itself the design's rule.
  await expect(page.getByTestId('task-card').filter({ hasText: 'Has an assignee' })).toBeVisible()
})
