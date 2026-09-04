import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requiredText } from '@/lib/api/validation'
import { prisma } from '@/lib/db'
import { requireUser, requireColumnAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'
import { reorderWithin, compactPositions } from '@/lib/ordering'

const patchColumnSchema = z
  .object({ name: requiredText(100).optional(), position: z.number().int().min(0).optional() })
  .refine((v) => v.name !== undefined || v.position !== undefined, 'nothing to update')

/** Rename and/or move. Both are ordinary member actions; only board deletion is owner-only. */
export async function PATCH(request: Request, ctx: { params: Promise<{ columnId: string }> }) {
  return handleErrors(request, async () => {
    const { columnId } = await ctx.params
    const user = await requireUser()
    const column = await requireColumnAccess(user.id, columnId)

    const parsed = patchColumnSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'Provide a name or a position.')

    if (parsed.data.name !== undefined) {
      await prisma.column.update({ where: { id: columnId }, data: { name: parsed.data.name } })
    }
    if (parsed.data.position !== undefined) {
      // Never write `position` directly — the funnel is what keeps the run dense (I5/D1).
      await reorderWithin(prisma, 'column', { boardId: column.boardId }, columnId, parsed.data.position)
    }

    return NextResponse.json(await prisma.column.findUniqueOrThrow({ where: { id: columnId } }))
  })
}

/**
 * Deletes a column and everything inside it.
 *
 * The task count is counted BEFORE the delete and returned, because the confirmation the
 * user saw has to be able to say how many tasks it is about to destroy — a cascade the user
 * cannot see is the one that surprises them (I7). Hard delete, no undo.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ columnId: string }> }) {
  return handleErrors(request, async () => {
    const { columnId } = await ctx.params
    const user = await requireUser()
    const column = await requireColumnAccess(user.id, columnId)

    const deletedTaskCount = await prisma.task.count({ where: { columnId } })
    await prisma.column.delete({ where: { id: columnId } })

    // Removing from the middle leaves a hole; renumber so the run stays 0..n-1 (I5).
    await compactPositions(prisma, 'column', { boardId: column.boardId })

    return NextResponse.json({ ok: true, deletedTaskCount })
  })
}
