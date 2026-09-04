'use client'

import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import { GripVertical, MessageSquare } from 'lucide-react'
import { TaskDialog } from './TaskDialog'
import { MoveTaskMenu } from './MoveTaskMenu'
import { AvatarStack } from './AvatarStack'
import { DueBadge } from './DueBadge'
import { CountChip } from './CountChip'
import type { BoardColumn, BoardTask, Member } from './types'

/**
 * A card, in three bands (design.md → Card anatomy):
 *
 *   meta     drag handle + move menu, muted until hover/focus
 *   title    the card's only saturated element, in the column's tint ink
 *   footer   assignee avatars left, counts right
 *
 * The tint arrives as `--tint-surface` / `--tint-ink`, inherited from the column element,
 * so a card needs no knowledge of which hue it is.
 *
 * The drag handle is a separate element rather than the card container: spreading
 * `dragHandleProps` on the container adds `role="button"` and would nest the card's own
 * buttons inside a button.
 */
export function TaskCard({
  task, index, columns, columnName, members, viewerId, viewerIsOwner,
}: {
  task: BoardTask
  index: number
  columns: Pick<BoardColumn, 'id' | 'name' | 'tasks'>[]
  columnName: string
  members: Member[]
  viewerId: string
  viewerIsOwner: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          data-tinted
          data-testid="task-card-shell"
          className={`group bg-[var(--tint-surface)] relative rounded-lg border border-transparent transition-shadow ${
            // One depth strategy: flat fills. A shadow appears only while dragging, where it
            // means "lifted" rather than decoration.
            snapshot.isDragging ? 'shadow-lg' : ''
          }`}
        >
          {/* meta band */}
          <div className="flex h-6 items-center justify-between px-2 pt-1.5">
            <span
              {...provided.dragHandleProps}
              aria-hidden="true"
              tabIndex={-1}
              className="text-tint-muted cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
              data-testid="drag-handle"
            >
              <GripVertical className="size-3.5" />
            </span>
            <MoveTaskMenu task={task} columns={columns} currentColumnName={columnName} />
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="focus-visible:ring-ring w-full rounded-lg px-3.5 pb-3.5 text-left focus-visible:ring-2 focus-visible:outline-none"
            data-testid="task-card"
          >
            <span
              className="text-[var(--tint-ink)] block text-sm leading-snug font-medium"
              data-testid="task-title"
            >
              {task.title}
            </span>

            {task.description ? (
              <span className="text-tint-muted mt-1 line-clamp-1 block text-xs">
                {task.description}
              </span>
            ) : null}

            {task.assignees.length > 0 || task.commentCount > 0 || task.dueDate ? (
              <span className="mt-3 flex items-center justify-between gap-2">
                <AvatarStack people={task.assignees} />
                <span className="flex items-center gap-1.5">
                  {/* Absent, not empty, when there is no due date (design.md). */}
                  <DueBadge dueDate={task.dueDate} />
                  {task.commentCount > 0 ? (
                    <CountChip
                      icon={<MessageSquare className="size-3" />}
                      count={task.commentCount}
                      label="comments"
                    />
                  ) : null}
                </span>
              </span>
            ) : null}
          </button>

          <TaskDialog
            task={task}
            members={members}
            viewerId={viewerId}
            viewerIsOwner={viewerIsOwner}
            open={open}
            onOpenChange={setOpen}
          />
        </div>
      )}
    </Draggable>
  )
}
