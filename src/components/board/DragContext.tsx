'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { useAnnounce } from './BoardAnnouncer'
import { useBoardPoll } from './useBoardPoll'
import { ColumnView } from './ColumnView'
import { AddColumn } from './AddColumn'
import type { Board, BoardColumn } from './types'

/**
 * Drag-and-drop, layered ON TOP of the keyboard move control — which was built and tested
 * first, deliberately, so the board is fully operable without this dependency.
 *
 * Optimistic, per design.md: the card lands where it was dropped immediately, and a
 * rejection rolls it back VISIBLY with a reason rather than silently reverting. A silent
 * revert is the worst outcome — the user believes the move happened.
 */
export function DragContext({
  board, viewerId, viewerIsOwner,
}: {
  board: Board
  viewerId: string
  viewerIsOwner: boolean
}) {
  const boardId = board.id
  const router = useRouter()
  const announce = useAnnounce()

  const [optimistic, setOptimistic] = useState<BoardColumn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // SC10. The poll pauses while a drag is in flight, so a card cannot move out from under
  // the pointer, and pauses in a hidden tab.
  const { board: live, stale } = useBoardPoll(boardId, board, { dragging })
  const columns = live.columns
  const members = live.members

  // Adjust state during render rather than in an effect: when the server sends new columns,
  // the optimistic overlay has been superseded and must be dropped. Holding the previous
  // props in state is the supported way to do this — copying props into state outright
  // would freeze the board (that bug already bit once, in T08).
  const [seenColumns, setSeenColumns] = useState(columns)
  if (seenColumns !== columns) {
    setSeenColumns(columns)
    setOptimistic(null)
  }

  const shown = optimistic ?? columns

  async function onDragEnd(result: DropResult) {
    setDragging(false)
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    // Apply locally first so the card does not snap back while the request is in flight.
    const next = shown.map((c) => ({ ...c, tasks: [...c.tasks] }))
    const from = next.find((c) => c.id === source.droppableId)
    const to = next.find((c) => c.id === destination.droppableId)
    if (!from || !to) return

    const [moved] = from.tasks.splice(source.index, 1)
    to.tasks.splice(destination.index, 0, moved)
    setOptimistic(next)
    setError(null)

    const res = await fetch(`/api/tasks/${draggableId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columnId: destination.droppableId, position: destination.index }),
    }).catch(() => null)

    if (!res || !res.ok) {
      // Roll back to the server's truth and SAY SO. Silence here would leave the user
      // believing a move that never happened.
      setOptimistic(null)
      const message = `Couldn’t move “${moved.title}”. It has been put back.`
      setError(message)
      announce(message)
      return
    }

    announce(`Moved “${moved.title}” to ${to.name}.`)
    router.refresh()
  }

  return (
    <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>

      {stale && !error ? (
        // The stale case: say so without taking the board away.
        <p role="status" className="text-muted-foreground border-b px-4 py-1.5 text-xs">
          Couldn&rsquo;t refresh — showing the last version.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive border-destructive/30 bg-destructive/5 border-b px-4 py-2 text-xs">
          {error}
        </p>
      ) : null}
      {/* Horizontal scroll lives here; each column scrolls vertically inside itself, so the
          page never scrolls in two directions at once (design.md). */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-4 p-4">
          {shown.map((column) => (
            <ColumnView
              key={column.id}
              column={column}
              columns={shown}
              members={members}
              viewerId={viewerId}
              viewerIsOwner={viewerIsOwner}
            />
          ))}
          <AddColumn boardId={boardId} />
        </div>
      </div>
    </DragDropContext>
  )
}
