'use client'

import { useState } from 'react'

import { Droppable } from '@hello-pangea/dnd'
import { TaskCard } from './TaskCard'
import { ColumnHeader } from './ColumnHeader'
import { AddTask } from './AddTask'
import { tintStyle } from '@/lib/tint'
import type { BoardColumn } from './types'

/**
 * One column: a drop target, and its own vertical scroll area.
 *
 * The board scrolls horizontally and each column scrolls vertically inside itself, so the
 * page never scrolls in both directions at once (design.md).
 *
 * The column owns the tint. `tintStyle` sets `--tint-surface` / `--tint-ink` here once, and
 * every card inside inherits them — so a card carries no knowledge of which hue it is, and
 * moving a card between columns re-tints it for free.
 */
export function ColumnView({ column, columns }: { column: BoardColumn; columns: BoardColumn[] }) {
  const [adding, setAdding] = useState(false)

  return (
    <section
      style={tintStyle(column.position)}
      className="bg-muted/30 flex max-h-full w-80 shrink-0 flex-col rounded-xl"
      aria-label={`${column.name}, ${column.tasks.length} tasks`}
      data-testid="board-column"
    >
      <ColumnHeader column={column} onAddTask={() => setAdding(true)} />

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3 ${
              snapshot.isDraggingOver ? 'bg-muted/60' : ''
            }`}
          >
            {column.tasks.length === 0 ? (
              // Empty state, per surface: quiet and actionable rather than a bare "No data".
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-center text-xs">
                No tasks yet
              </p>
            ) : (
              column.tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  columns={columns}
                  columnName={column.name}
                />
              ))
            )}
            {provided.placeholder}
            <AddTask
              columnId={column.id}
              columnName={column.name}
              open={adding}
              onOpenChange={setAdding}
            />
          </div>
        )}
      </Droppable>
    </section>
  )
}
