/** How a due date reads on a card. */
export type DueState = 'overdue' | 'due-soon' | 'none'

/** A task is "due soon" within this many calendar days of today, inclusive. */
export const DUE_SOON_DAYS = 2

/**
 * Classifies a due date for display (SC4).
 *
 * `today` is a PARAMETER, not a call to the clock. That is what makes the rule testable
 * against fixed dates — a function reading the clock internally cannot be asserted against
 * "yesterday" without freezing time globally.
 *
 * Comparison is by CALENDAR DAY, never elapsed hours: a task due at 23:59 yesterday is one
 * minute in the past but a whole day overdue, and an hours-based difference would round it
 * to "due today". `dueDate` is a DATE column precisely so this is well defined — "due the
 * 14th" means the 14th for every viewer, wherever they are.
 */
export function classifyDueDate(due: Date | string | null | undefined, today: Date): DueState {
  if (!due) return 'none'

  const dueDay = dueDayNumber(due)
  const todayDay = localDayNumber(today)
  if (dueDay === null) return 'none'

  const days = dueDay - todayDay
  if (days < 0) return 'overdue'
  return days <= DUE_SOON_DAYS ? 'due-soon' : 'none'
}

/**
 * The calendar day a DUE DATE falls on, always read in UTC.
 *
 * A DATE column arrives as UTC midnight, so its UTC fields ARE its calendar day. Reading it
 * locally would shift it a day for anyone west of UTC — which is exactly the bug that
 * storing a DATE rather than a timestamp was meant to rule out.
 */
function dueDayNumber(value: Date | string): number | null {
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    if (!y || !m || !d) return null
    return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
  }
  if (Number.isNaN(value.getTime())) return null
  return Math.floor(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / 86_400_000)
}

/**
 * The calendar day "today" falls on, always read LOCALLY.
 *
 * "Today" is a fact about where the viewer is, not about UTC. These two functions are
 * separate on purpose: an earlier version guessed which to use from whether the value
 * looked like midnight, and that heuristic classified a task due at 23:59 yesterday as due
 * today for anyone east of UTC.
 */
function localDayNumber(value: Date): number {
  return Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000)
}
