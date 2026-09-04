'use client'

import { useState } from 'react'
import { ColumnView } from './ColumnView'
import type { Board } from './types'

/**
 * The board.
 *
 * The initial data is rendered on the server and handed in, so there is no fetch-in-effect
 * and no empty first paint. The loading skeleton is the route's Suspense fallback
 * (`loading.tsx`), which is what makes it match the real geometry: it is replaced by the
 * streamed markup rather than by a second client render.
 *
 * `refreshError` exists for the polling slice (T17): when a refresh fails, the board
 * already on screen STAYS and the failure is reported inline. Blanking a board the user is
 * reading because one background request failed is worse than showing slightly stale data.
 */
export function BoardView({ initialBoard }: { initialBoard: Board }) {
  const [board] = useState<Board>(initialBoard)
  const [refreshError] = useState(false)

  return (
    <div className="flex h-full flex-col" data-testid="board-view">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="truncate text-lg font-semibold">{board.name}</h1>
        {refreshError ? (
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
