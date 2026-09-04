import { describe, it, expect } from 'vitest'
import { classifyDueDate, type DueState } from '@/lib/dates'

/**
 * SC4's proof. `today` is a parameter rather than a call to the clock, which is the only
 * way to assert fixed dates — a function reading the clock internally cannot be tested
 * against "yesterday" without freezing time globally.
 */
// "Today" is built from LOCAL calendar fields, because that is what it means to the viewer
// and what the app will pass. An earlier version used a UTC-midnight instant, which is a
// different calendar day depending on where you run it — the suite passed in Tokyo and
// failed in Los Angeles. A test for timezone-correctness must not itself be timezone-dependent.
const TODAY = new Date(2026, 2, 14)                        // local 14 March 2026
const on = (iso: string) => new Date(`${iso}T00:00:00Z`)   // a DATE column value, UTC midnight

describe('T11 — classifyDueDate (SC4)', () => {
  const cases: [string, string | null, DueState][] = [
    ['yesterday      → overdue',  '2026-03-13', 'overdue'],
    ['today          → due-soon', '2026-03-14', 'due-soon'],
    ['tomorrow (+1)  → due-soon', '2026-03-15', 'due-soon'],
    ['+2 days        → due-soon', '2026-03-16', 'due-soon'],
    ['+3 days        → neither',  '2026-03-17', 'none'],
    ['no due date    → neither',  null,         'none'],
  ]

  for (const [label, due, expected] of cases) {
    it(label, () => {
      expect(classifyDueDate(due ? on(due) : null, TODAY)).toBe(expected)
    })
  }

  it('treats long past and far future correctly', () => {
    expect(classifyDueDate(on('2020-01-01'), TODAY)).toBe('overdue')
    expect(classifyDueDate(on('2030-01-01'), TODAY)).toBe('none')
  })

  it('compares CALENDAR DAYS, not elapsed hours', () => {
    // 23:59 "yesterday" is 1 minute before today, but it is still a different calendar day
    // and must read as overdue. An hours-based diff would call it "due today".
    expect(classifyDueDate(new Date('2026-03-13T23:59:00Z'), TODAY)).toBe('overdue')
  })

  it('is stable regardless of the host timezone', () => {
    // The board is read by people in different places; "due the 14th" must mean the 14th
    // for all of them. Run this file under TZ=America/Los_Angeles and TZ=Asia/Tokyo — the
    // two extremes either side of UTC — and every case above must hold unchanged.
    expect(classifyDueDate(on('2026-03-14'), new Date(2026, 2, 14))).toBe('due-soon')
    expect(classifyDueDate(on('2026-03-13'), new Date(2026, 2, 14))).toBe('overdue')
    expect(classifyDueDate(on('2026-03-17'), new Date(2026, 2, 14))).toBe('none')
  })

  it('accepts a date-only string as well as a Date, since the API returns JSON', () => {
    expect(classifyDueDate('2026-03-13', TODAY)).toBe('overdue')
    expect(classifyDueDate('2026-03-17', TODAY)).toBe('none')
  })
})
