import Link from 'next/link'
import { AddColumn } from './AddColumn'
import { DragContext } from './DragContext'
import { BoardAnnouncer } from './BoardAnnouncer'
import { BoardActions } from './BoardActions'
import type { Board } from './types'

/**
 * The board.
 *
 * The initial data is rendered on the server and handed in, so there is no fetch-in-effect
 * and no empty first paint. The loading skeleton is the route's Suspense fallback
 * (`loading.tsx`), which is what makes it match the real geometry: it is replaced by the
 * streamed markup rather than by a second client render.
 *
 * The board is rendered straight from its props, NOT copied into state. `useState(prop)`
 * only reads its argument on the first render, so a copy would freeze the board at mount:
 * `router.refresh()` after a mutation would fetch new data on the server, hand it down, and
 * change nothing on screen. That bug was real here — a created column never appeared — and
 * it would have silently defeated polling in T17 as well.
 */
export function BoardView({ initialBoard, viewerId }: { initialBoard: Board; viewerId: string }) {
  const board = initialBoard

  return (
    <BoardAnnouncer>
    <div className="flex h-full flex-col" data-testid="board-view">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          {/* A board with no way back to the board list is a dead end. */}
          <Link
            href="/boards"
            className="text-muted-foreground hover:text-foreground shrink-0 text-sm underline underline-offset-4"
          >
            Boards
          </Link>
          <BoardActions
            boardId={board.id}
            name={board.name}
            taskCount={board.columns.reduce((n, c) => n + c.tasks.length, 0)}
            viewerIsOwner={board.viewerIsOwner}
          />
        </div>
        <Link
          href={`/teams/${board.teamId}/settings`}
          className="text-muted-foreground hover:text-foreground shrink-0 text-sm underline underline-offset-4"
        >
          Team settings
        </Link>
      </div>

      {board.columns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium">This board has no columns yet.</p>
          <p className="text-muted-foreground text-sm">Columns are the stages your tasks move through.</p>
          <AddColumn boardId={board.id} variant="empty" />
        </div>
      ) : (
        <DragContext board={board} viewerId={viewerId} viewerIsOwner={board.viewerIsOwner} />
      )}
    </div>
    </BoardAnnouncer>
  )
}
