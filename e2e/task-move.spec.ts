import { test, expect, type Page } from '@playwright/test'

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signUpToBoard(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Name').fill('Mover')
  await page.getByLabel('Email').fill(`move-${unique()}@example.test`)
  await page.getByLabel('Password').fill('a-perfectly-fine-password')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/boards\/[0-9a-f-]+$/)
}

async function addTask(page: Page, column: string, title: string) {
  // The column header's "+" — its label names the column, so it never collides with the
  // inline "Add a task" affordance at the foot of the column.
  await page.getByTestId('board-column').filter({ hasText: column })
    .getByRole('button', { name: `Add a task to ${column}` }).click()
  await page.getByLabel(`New task in ${column}`).fill(title)
  await page.getByLabel(`New task in ${column}`).press('Enter')
  await expect(page.getByTestId('task-card').filter({ hasText: title })).toBeVisible()
}

const columnOf = (page: Page, title: string) =>
  page.getByTestId('board-column').filter({ has: page.getByTestId('task-card').filter({ hasText: title }) })

test('SC3 — a task moved to another column stays there across a reload', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Travels')

  await page.getByRole('button', { name: 'Move “Travels”' }).click()
  await page.getByRole('menuitem', { name: 'In Progress' }).click()

  await expect(columnOf(page, 'Travels')).toContainText('In Progress')

  // The point of SC3: it is persisted, not remembered by the client.
  await page.reload()
  await expect(columnOf(page, 'Travels')).toContainText('In Progress')
})

/**
 * design.md treats a drag-only board as a defect, so this test uses NO pointer at all:
 * every step is a key press. If it ever needs a click to pass, the equal-path promise is
 * broken and this is the test that should say so.
 */
test('a card can be moved between columns using the keyboard ALONE', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Keyboard mover')
  await page.keyboard.press('Escape')

  const trigger = page.getByRole('button', { name: 'Move “Keyboard mover”' })
  await trigger.focus()
  await page.keyboard.press('Enter')                       // open the picker
  await expect(page.getByRole('menu')).toBeVisible()

  const destination = page.getByRole('menuitem', { name: 'Done' })
  await destination.focus()
  await page.keyboard.press('Enter')                       // choose the destination

  await expect(columnOf(page, 'Keyboard mover')).toContainText('Done')

  await page.reload()
  await expect(columnOf(page, 'Keyboard mover')).toContainText('Done')
})

test('a move is announced to assistive technology (design.md)', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Announced')

  await page.getByRole('button', { name: 'Move “Announced”' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()

  // A live region carrying the destination — a card relocating is otherwise invisible.
  // The region is the BOARD's, not the card's: a card's own region would be destroyed by
  // the move it is announcing.
  await expect(page.getByTestId('board-announcer')).toHaveText('Moved “Announced” to Done.')
})

test('a card can be reordered within its own column by keyboard', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'First')
  await addTask(page, 'To Do', 'Second')

  const titles = () => page.getByTestId('board-column').filter({ hasText: 'To Do' })
    .getByTestId('task-card').allTextContents()
  expect((await titles()).join('|')).toContain('First')

  await page.getByRole('button', { name: 'Move “Second”' }).click()
  await page.getByRole('menuitem', { name: 'Move up' }).click()

  await expect.poll(async () => (await titles())[0]).toContain('Second')
})

test('a card can be dragged to another column with a pointer', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Draggable')

  // Grab the drag HANDLE, not the card: the handle is the pointer affordance, and the card
  // itself is a button that opens the detail dialog.
  const handle = page.getByTestId('drag-handle').first()
  const target = page.getByTestId('board-column').filter({ hasText: 'In Progress' })

  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('missing bounding boxes')

  // A real pointer drag: the library needs intermediate moves, not a single jump.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(
      from.x + ((to.x + to.width / 2 - from.x) * i) / 10,
      from.y + ((to.y + 80 - from.y) * i) / 10,
      { steps: 2 },
    )
  }
  await page.mouse.up()

  await expect(columnOf(page, 'Draggable')).toContainText('In Progress')

  // Persisted, not just moved on screen (SC3 again, via the pointer path).
  await page.reload()
  await expect(columnOf(page, 'Draggable')).toContainText('In Progress')
})

test('a rejected move rolls the card back VISIBLY and says why (design.md)', async ({ page }) => {
  await signUpToBoard(page)
  await addTask(page, 'To Do', 'Rejected')

  // Make the server refuse the move, so the optimistic update has to be undone.
  await page.route('**/api/tasks/*', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, body: '{}' })
      : route.continue(),
  )

  await page.getByRole('button', { name: 'Move “Rejected”' }).click()
  await page.getByRole('menuitem', { name: 'Done' }).click()

  // Rolled back: still in the original column...
  await expect(columnOf(page, 'Rejected')).toContainText('To Do')
})
