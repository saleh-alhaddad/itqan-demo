import { BoardSkeleton } from '@/components/board/BoardSkeleton'

/**
 * The board's Suspense fallback. Skeleton cards match the real card geometry so nothing
 * shifts when the streamed board replaces them — and never a centred spinner, which throws
 * away the layout the user is looking at (design.md).
 */
export default function Loading() {
  return (
    <main className="h-svh p-4">
      <BoardSkeleton />
    </main>
  )
}
