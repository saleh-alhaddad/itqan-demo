import { notFound } from 'next/navigation'
import { BoardView } from '@/components/board/BoardView'
import { requireUserOrRedirect, requireBoardAccess } from '@/lib/auth/guard'

/**
 * The board route.
 *
 * Access is checked here as well as in the API the client calls. That is not redundancy for
 * its own sake: without it a stranger who knows a board id would get a rendered shell and a
 * 404 a moment later, which both looks broken and confirms the id is worth guessing at.
 */
export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  // Next 16: params is a Promise.
  const { boardId } = await params
  const user = await requireUserOrRedirect()

  try {
    await requireBoardAccess(user.id, boardId)
  } catch {
    // The page equivalent of the API's shared 404: a board in someone else's team is
    // indistinguishable from one that does not exist (I2).
    notFound()
  }

  return (
    <main className="h-svh">
      <BoardView boardId={boardId} />
    </main>
  )
}
