'use client'

import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import { GripVertical } from 'lucide-react'
import { TaskDialog } from './TaskDialog'
import { MoveTaskMenu } from './MoveTaskMenu'
import type { BoardColumn, BoardTask } from './types'

/**
 * A card: the trigger for its detail dialog, a keyboard move menu, and a pointer drag handle.
 *
 * The drag handle is a SEPARATE element rather than the whole card. Spreading
 * `dragHandleProps` over the container puts `role="button"` and `tabindex="0"` on it, which
 * would nest the card button and the move menu inside a button — invalid markup, and it
 * makes the inner controls ambiguous to assistive technology. That regression appeared the
 * moment drag was added, on a card that had been clean.
 *
 * The handle is therefore pointer-only (`aria-hidden`, not focusable): keyboard and screen
 * reader users move cards through MoveTaskMenu, which is the equal path design.md requires
 * and a better experience than dragging with arrow keys.
 */
export function TaskCard({
  task, index, columns, columnName,
}: {
  task: BoardTask
  index: number
  columns: Pick<BoardColumn, 'id' | 'name' | 'tasks'>[]
  columnName: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`relative ${snapshot.isDragging ? 'opacity-90 shadow-md' : ''}`}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-background hover:border-foreground/20 focus-visible:ring-ring w-full rounded-md border p-3 pr-16 pl-7 text-left text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
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

          {/* Pointer-only affordance; the keyboard equivalent is the move menu beside it. */}
          <span
            {...provided.dragHandleProps}
            aria-hidden="true"
            tabIndex={-1}
            className="text-muted-foreground absolute top-3 left-1.5 cursor-grab active:cursor-grabbing"
            data-testid="drag-handle"
          >
            <GripVertical className="size-3.5" />
          </span>

          {/* Outside the card button: a button inside a button is invalid markup. */}
          <span className="absolute top-2 right-2">
            <MoveTaskMenu task={task} columns={columns} currentColumnName={columnName} />
          </span>

          <TaskDialog task={task} open={open} onOpenChange={setOpen} />
        </div>
      )}
    </Draggable>
  )
}
