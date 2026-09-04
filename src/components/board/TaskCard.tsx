import type { BoardTask } from './types'

/**
 * A single card. Kept presentational: interactions (open, move, assign) arrive in later
 * slices, and this stays the one place card geometry is defined so BoardSkeleton can match it.
 */
export function TaskCard({ task }: { task: BoardTask }) {
  return (
    <article
      className="bg-background hover:border-foreground/20 rounded-md border p-3 text-sm shadow-xs transition-colors"
      data-testid="task-card"
    >
      <h3 className="font-medium">{task.title}</h3>

      {task.assignees.length > 0 || task.commentCount > 0 ? (
        <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
          {task.assignees.length > 0 ? (
            <span>{task.assignees.map((a) => a.name).join(', ')}</span>
          ) : null}
          {task.commentCount > 0 ? (
            // The count is spelled out for assistive tech; the digit alone is ambiguous.
            <span aria-label={`${task.commentCount} comments`}>{task.commentCount} 💬</span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
