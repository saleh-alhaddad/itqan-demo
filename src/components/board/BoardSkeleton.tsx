/**
 * Loading state.
 *
 * Skeleton cards deliberately match the real card geometry (same padding, same title line
 * height, same gap) so nothing shifts when data lands. A centred spinner is explicitly not
 * used here: it throws away the layout the user is already looking at, and on a re-fetch
 * that reads as the board disappearing.
 */
export function BoardSkeleton({ columns = 3, cards = 3 }: { columns?: number; cards?: number }) {
  return (
    <div className="flex h-full gap-4" aria-hidden="true" data-testid="board-skeleton">
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="bg-muted/40 flex w-72 shrink-0 flex-col rounded-lg p-3">
          <div className="bg-muted mb-3 h-5 w-24 animate-pulse rounded" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: cards }).map((__, i) => (
              <div key={i} className="bg-background rounded-md border p-3">
                <div className="bg-muted h-4 w-4/5 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
