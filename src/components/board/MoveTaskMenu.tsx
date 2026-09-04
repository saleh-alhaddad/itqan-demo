'use client'

import { useRouter } from 'next/navigation'
import { MoveHorizontal } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAnnounce } from './BoardAnnouncer'
import type { BoardColumn, BoardTask } from './types'

/**
 * Moving a card without a pointer.
 *
 * This is an EQUAL path, not a fallback: design.md treats a drag-only board as a defect,
 * and it is built (and tested) before any drag library is added, so the board is fully
 * operable if that dependency ever has to be dropped. It is also what mobile uses, where
 * dragging between columns is impractical.
 *
 * The move is announced through the BOARD's live region, not one owned by this card: a
 * move re-parents the card's subtree, so a region living here would be destroyed by the
 * very action it exists to announce.
 */
export function MoveTaskMenu({
  task, columns, currentColumnName,
}: {
  task: BoardTask
  columns: Pick<BoardColumn, 'id' | 'name' | 'tasks'>[]
  currentColumnName: string
}) {
  const router = useRouter()
  const announce = useAnnounce()

  const index = columns.find((c) => c.id === task.columnId)?.tasks.findIndex((t) => t.id === task.id) ?? 0
  const siblings = columns.find((c) => c.id === task.columnId)?.tasks ?? []

  async function move(body: Record<string, unknown>, message: string) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    announce(message)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
          // Icon-only, so it carries its own accessible name naming the card it acts on.
          aria-label={`Move “${task.title}”`}
          className="hover:bg-muted focus-visible:ring-ring rounded p-1 focus-visible:ring-2 focus-visible:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <MoveHorizontal className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>

        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Move within {currentColumnName}</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={index <= 0}
            onSelect={() => void move({ position: index - 1 }, `Moved “${task.title}” up in ${currentColumnName}.`)}
          >
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={index >= siblings.length - 1}
            onSelect={() => void move({ position: index + 1 }, `Moved “${task.title}” down in ${currentColumnName}.`)}
          >
            Move down
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Move to column</DropdownMenuLabel>
          {columns.map((column) => (
            <DropdownMenuItem
              key={column.id}
              disabled={column.id === task.columnId}
              onSelect={() =>
                void move({ columnId: column.id }, `Moved “${task.title}” to ${column.name}.`)
              }
            >
              {column.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
    </DropdownMenu>
  )
}
