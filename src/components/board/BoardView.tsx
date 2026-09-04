'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { BoardSkeleton } from './BoardSkeleton'
import { ColumnView } from './ColumnView'
import type { Board } from './types'

type Status = 'loading' | 'ready' | 'error'

/**
 * The board.
 *
 * State handling follows design.md deliberately:
 *  - loading  skeleton matching the real card geometry, never a centred spinner
 *  - empty    a board with no columns invites creating one; a column with no tasks says so quietly
 *  - error    inline and retryable, and CRUCIALLY a failed re-fetch keeps the board that is
 *             already on screen. Blanking a board the user is reading because one request
 *             failed is worse than showing slightly stale data — and once polling arrives
 *             (T17) that failure happens unattended, every ten seconds.
 */
export function BoardView({ boardId }: { boardId: string }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setBoard((await res.json()) as Board)
      setStatus('ready')
    } catch {
      // Only surface a full error screen if we have nothing to show. With a board already
      // rendered, the failure is reported inline and the stale board stays put.
      setStatus('error')
    }
  }, [boardId])

  useEffect(() => {
    void load()
  }, [load])

  if (status === 'loading' && !board) {
    return (
      <div className="h-full p-4">
        <BoardSkeleton />
      </div>
    )
  }

  if (status === 'error' && !board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium">This board could not be loaded.</p>
        <p className="text-muted-foreground text-sm">
          It may have been deleted, or you may no longer have access to it.
        </p>
        <Button variant="outline" onClick={() => { setStatus('loading'); void load() }}>
          Try again
        </Button>
      </div>
    )
  }

  if (!board) return null

  return (
    <div className="flex h-full flex-col" data-testid="board-view">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="truncate text-lg font-semibold">{board.name}</h1>
        {status === 'error' ? (
          // The stale-data case: say so without taking the board away.
          <p role="status" className="text-muted-foreground text-xs">
            Couldn&rsquo;t refresh — showing the last version.
          </p>
        ) : null}
      </div>

      {board.columns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-medium">This board has no columns yet.</p>
          <p className="text-muted-foreground text-sm">Columns are the stages your tasks move through.</p>
        </div>
      ) : (
        // Horizontal scroll here; each column scrolls vertically inside itself, so the page
        // never scrolls in two directions at once.
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 p-4">
            {board.columns.map((column) => <ColumnView key={column.id} column={column} />)}
          </div>
        </div>
      )}
    </div>
  )
}
