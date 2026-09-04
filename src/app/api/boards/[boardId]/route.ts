import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireBoardAccess, requireTeamOwner } from '@/lib/auth/guard'
import { handleErrors, notFound, apiError } from '@/lib/api/errors'
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

const patchBoardSchema = z.object({ name: z.string().trim().min(1).max(100) })

/** Rename. Any member of the board's team — renaming is not a destructive act. */
export async function PATCH(request: Request, ctx: { params: Promise<{ boardId: string }> }) {
  return handleErrors(async () => {
    const { boardId } = await ctx.params
    const user = await requireUser()
    await requireBoardAccess(user.id, boardId)

    const parsed = patchBoardSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'A board needs a name.')

    return NextResponse.json(
      await prisma.board.update({ where: { id: boardId }, data: { name: parsed.data.name } }),
    )
  })
}

/**
 * Delete. **Team owner only** (SC6) — the one board action a plain member cannot do.
 *
 * The task count is taken before the delete and returned, so the confirmation the user saw
 * can state what the cascade destroys. A cascade the user cannot see is the one that
 * surprises them (I7).
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ boardId: string }> }) {
  return handleErrors(async () => {
    const { boardId } = await ctx.params
    const user = await requireUser()

    // Establishes membership first, so a non-member gets the shared 404 rather than
    // learning the board exists but belongs to a team they are not in.
    const board = await requireBoardAccess(user.id, boardId)
    await requireTeamOwner(user.id, board.teamId)

    const deletedTaskCount = await prisma.task.count({ where: { column: { boardId } } })
    await prisma.board.delete({ where: { id: boardId } })

    return NextResponse.json({ ok: true, deletedTaskCount })
  })
}
