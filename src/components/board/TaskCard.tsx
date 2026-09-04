'use client'

import { useState } from 'react'
import { TaskDialog } from './TaskDialog'
import type { BoardTask } from './types'

/**
 * A card, and the trigger for its detail dialog.
 *
 * A real <button>, not a div with a click handler: that is what makes the card reachable by
 * Tab and operable with Enter and Space without reimplementing any of it. Card geometry is
 * defined here and mirrored by BoardSkeleton, so the skeleton does not shift when data lands.
 */
export function TaskCard({ task }: { task: BoardTask }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-background hover:border-foreground/20 focus-visible:ring-ring w-full rounded-md border p-3 text-left text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
        data-testid="task-card"
      >
        <span className="block font-medium">{task.title}</span>

        {task.assignees.length > 0 || task.commentCount > 0 ? (
          <span className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
            {task.assignees.length > 0 ? <span>{task.assignees.map((a) => a.name).join(', ')}</span> : null}
            {task.commentCount > 0 ? (
              <span aria-label={`${task.commentCount} comments`}>{task.commentCount} 💬</span>
            ) : null}
          </span>
        ) : null}
      </button>

      <TaskDialog task={task} open={open} onOpenChange={setOpen} />
    </>
  )
}
