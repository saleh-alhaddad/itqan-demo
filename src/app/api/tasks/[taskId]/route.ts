import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireTaskAccess, requireColumnAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'
import { reorderWithin, compactPositions, appendPosition } from '@/lib/ordering'

/**
 * Edit and move. `null` is meaningful for the optional fields — it CLEARS them — which is
 * why they are `.nullable()` rather than merely optional: `undefined` means "leave alone",
 * `null` means "remove". Conflating the two would make a due date impossible to clear.
 */
const patchTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  columnId: z.string().optional(),
  position: z.number().int().min(0).optional(),
})

export async function PATCH(request: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleErrors(async () => {
    const { taskId } = await ctx.params
    const user = await requireUser()
    const task = await requireTaskAccess(user.id, taskId)

    const parsed = patchTaskSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'Check the values and try again.')
    const { title, description, dueDate, columnId, position } = parsed.data

    const fields: Record<string, unknown> = {}
    if (title !== undefined) fields.title = title
    if (description !== undefined) fields.description = description
    if (dueDate !== undefined) fields.dueDate = dueDate === null ? null : new Date(`${dueDate}T00:00:00Z`)
    if (Object.keys(fields).length > 0) await prisma.task.update({ where: { id: taskId }, data: fields })

    // Moving between columns is checked separately: the destination must ALSO be one the
    // actor can reach, or a member of team A could fling a task into team B's board.
    if (columnId !== undefined && columnId !== task.columnId) {
      await requireColumnAccess(user.id, columnId)
      const sourceColumnId = task.columnId

      await prisma.task.update({
        where: { id: taskId },
        data: { columnId, position: await appendPosition(prisma, 'task', { columnId }) },
      })
      // The source column now has a hole where the task was.
      await compactPositions(prisma, 'task', { columnId: sourceColumnId })
      if (position !== undefined) await reorderWithin(prisma, 'task', { columnId }, taskId, position)
    } else if (position !== undefined) {
      await reorderWithin(prisma, 'task', { columnId: task.columnId }, taskId, position)
    }

    return NextResponse.json(await prisma.task.findUniqueOrThrow({ where: { id: taskId } }))
  })
}

/** SC6: ANY member of the board's team may delete a task — this is not an owner-only action. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleErrors(async () => {
    const { taskId } = await ctx.params
    const user = await requireUser()
    const task = await requireTaskAccess(user.id, taskId)

    await prisma.task.delete({ where: { id: taskId } })
    // Removing from the middle leaves a hole; renumber so the run stays 0..n-1 (I5).
    await compactPositions(prisma, 'task', { columnId: task.columnId })

    return NextResponse.json({ ok: true })
  })
}
