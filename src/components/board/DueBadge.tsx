import { AlertCircle, CalendarClock, Calendar } from 'lucide-react'
import { classifyDueDate, type DueState } from '@/lib/dates'

/**
 * The due-date badge (SC4).
 *
 * Colour is never the only signal. The badge always carries **text** naming the state and
 * an **icon that differs per state**, so it survives greyscale, colour-blindness, and the
 * one case the palette cannot avoid: `--due-soon` shares a hue family with the amber column
 * tint, so on an amber card the colour distinction is weak even though the text is not.
 */
export function DueBadge({ dueDate, today = new Date() }: { dueDate: Date | string | null; today?: Date }) {
  if (!dueDate) return null

  const state = classifyDueDate(dueDate, today)
  const { icon: Icon, colour } = PRESENTATION[state]

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colour}`}
      data-testid="due-badge"
      data-due-state={state}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label(dueDate, state, today)}
    </span>
  )
}

const PRESENTATION: Record<DueState, { icon: typeof Calendar; colour: string }> = {
  overdue: { icon: AlertCircle, colour: 'text-[var(--overdue)]' },
  'due-soon': { icon: CalendarClock, colour: 'text-[var(--due-soon)]' },
  none: { icon: Calendar, colour: 'text-tint-muted' },
}

/**
 * The text half of the signal. "Overdue" and "Due today" say the state outright; a plain
 * date says the state is neither, which is the honest reading of "not urgent".
 */
function label(dueDate: Date | string, state: DueState, today: Date): string {
  const day = typeof dueDate === 'string' ? dueDate.slice(0, 10) : dueDate.toISOString().slice(0, 10)
  const [y, m, d] = day.split('-').map(Number)
  const short = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', timeZone: 'UTC',
  })

  if (state === 'overdue') return `Overdue · ${short}`

  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(todayDay.getFullYear(), todayDay.getMonth(), todayDay.getDate())) / 86_400_000)
  if (state === 'due-soon') {
    if (diff === 0) return 'Due today'
    if (diff === 1) return 'Due tomorrow'
    return `Due ${short}`
  }
  return short
}
