import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireTeamMember } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'
import { createBoardWithDefaultColumns } from '@/lib/provisioning'

const createBoardSchema = z.object({ name: z.string().trim().min(1).max(100) })

/**
 * Create a board. ANY member may — only DELETION is owner-only (SC6).
 *
 * Reuses signup's `createBoardWithDefaultColumns`, so a board made here starts identically
 * to the one provisioned at signup. Two copies of "the default columns" is exactly the pair
 * that drifts, and the drift would be invisible until someone compared two boards.
 */
export async function POST(request: Request, ctx: { params: Promise<{ teamId: string }> }) {
  return handleErrors(async () => {
    const { teamId } = await ctx.params
    const actor = await requireUser()
    await requireTeamMember(actor.id, teamId)

    const parsed = createBoardSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'A board needs a name.')

    const board = await prisma.$transaction((tx) =>
      createBoardWithDefaultColumns(tx, teamId, parsed.data.name),
    )
    return NextResponse.json(board, { status: 201 })
  })
}
