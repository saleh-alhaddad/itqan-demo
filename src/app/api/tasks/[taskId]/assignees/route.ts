import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireTaskAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'

const assigneesSchema = z.object({ userIds: z.array(z.string()).max(50) })

/**
 * Replaces a task's assignees (I4 / SC9).
 *
 * PUT, not POST: the client sends the set it wants, and the server makes that true. An
 * add/remove pair would need the client to know the current set, which it cannot while the
 * board is being polled by other people.
 *
 * **Containment is validated as a whole before anything is written.** Applying the valid
 * half of a request and rejecting the rest would leave the task in a state nobody asked
 * for, and would make the failure look partly successful.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleErrors(request, async () => {
    const { taskId } = await ctx.params
    const actor = await requireUser()
    // Establishes access AND gives us the ownership chain without a second query.
    const task = await requireTaskAccess(actor.id, taskId)

    const parsed = assigneesSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'Provide a list of user ids.')

    // Duplicates in the request are the caller's slip, not an error worth failing over.
    const wanted = [...new Set(parsed.data.userIds)]
    const teamId = task.column.board.teamId

    if (wanted.length > 0) {
      const memberCount = await prisma.membership.count({
        where: { teamId, userId: { in: wanted } },
      })
      if (memberCount !== wanted.length) {
        return apiError('NOT_A_MEMBER', 400,
          'Everyone assigned to a task must be a member of the team that owns its board.')
      }
    }

    // One transaction: the set is replaced, never appended to, and never half-written.
    await prisma.$transaction([
      prisma.taskAssignee.deleteMany({ where: { taskId, userId: { notIn: wanted.length ? wanted : ['-'] } } }),
      prisma.taskAssignee.createMany({
        data: wanted.map((userId) => ({ taskId, userId })),
        skipDuplicates: true,
      }),
    ])

    return NextResponse.json({ ok: true, userIds: wanted })
  })
}
