import { TaskCard } from './TaskCard'
import { ColumnHeader } from './ColumnHeader'
import type { BoardColumn } from './types'

/**
 * One column. Scrolls vertically on its own — the board scrolls horizontally, so the page
 * itself never scrolls in both directions at once (design.md).
 */
export function ColumnView({ column }: { column: BoardColumn }) {
  return (
    <section
      className="bg-muted/40 flex max-h-full w-72 shrink-0 flex-col rounded-lg"
      aria-label={`${column.name}, ${column.tasks.length} tasks`}
      data-testid="board-column"
    >
      <ColumnHeader column={column} />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {column.tasks.length === 0 ? (
          // Empty state, per surface: quiet and actionable rather than a bare "No data".
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
            No tasks yet
          </p>
        ) : (
          column.tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </section>
  )
}
