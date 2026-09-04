import { notFound } from 'next/navigation'
import { BoardView } from '@/components/board/BoardView'
import { requireUserOrRedirect } from '@/lib/auth/guard'
import { loadBoardFor } from '@/lib/boards'

/**
 * The board.
 *
 * The authorization is INSIDE `loadBoardFor` — it queries by membership, so a non-member
 * gets null and there is nothing to render. This page does not rely on the route's layout
 * for that: Next renders layouts and pages concurrently, so a page that loaded unscoped
 * data would serialise it into the RSC payload even while the layout was throwing a 404.
 */
export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  // Next 16: params is a Promise.
  const { boardId } = await params
  const user = await requireUserOrRedirect()

  const board = await loadBoardFor(user.id, boardId)
  // Inaccessible and absent are the same outcome (I2).
  if (!board) notFound()

  return (
    <main className="h-svh">
      <BoardView initialBoard={board} viewerId={user.id} viewerName={user.name} />
    </main>
  )
}
