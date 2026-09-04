import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { handleErrors, notFound } from '@/lib/api/errors'
import { loadBoardFor } from '@/lib/boards'

/** The endpoint the 10-second poll re-fetches (SC10). Never cached. */
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, ctx: { params: Promise<{ boardId: string }> }) {
  return handleErrors(async () => {
    // Next 16: params is a Promise. Reading it without awaiting compiles cleanly and is broken.
    const { boardId } = await ctx.params
    const user = await requireUser()

    // Authorization lives in the query itself (see lib/boards.ts): a non-member and an
    // absent board both yield null, and both answer with the one shared 404 (I2/SC5).
    const board = await loadBoardFor(user.id, boardId)
    if (!board) return notFound()

    return NextResponse.json(board)
  })
}
