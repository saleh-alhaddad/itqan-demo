import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireTeamOwner } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'

const patchMemberSchema = z.object({ role: z.enum(['OWNER', 'MEMBER']) })

/**
 * I6 — a team always keeps at least one owner.
 *
 * Checked inside the same transaction as the write it guards. Counting first and writing
 * afterwards would leave a window where two concurrent requests each see two owners and
 * each remove one, leaving a team nobody can administer and which cannot be repaired
 * through the UI.
 */
async function assertNotLastOwner(tx: typeof prisma, teamId: string, userId: string) {
  const target = await tx.membership.findUnique({ where: { userId_teamId: { userId, teamId } } })
  if (!target || target.role !== 'OWNER') return
  const owners = await tx.membership.count({ where: { teamId, role: 'OWNER' } })
  if (owners <= 1) {
    throw new LastOwnerError()
  }
}

class LastOwnerError extends Error {}

/** Change a member's role. Owner only. */
export async function PATCH(request: Request, ctx: { params: Promise<{ teamId: string; userId: string }> }) {
  return handleErrors(async () => {
    const { teamId, userId } = await ctx.params
    const actor = await requireUser()
    await requireTeamOwner(actor.id, teamId)

    const parsed = patchMemberSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'Role must be OWNER or MEMBER.')

    try {
      const updated = await prisma.$transaction(async (tx) => {
        if (parsed.data.role === 'MEMBER') {
          await assertNotLastOwner(tx as unknown as typeof prisma, teamId, userId)
        }
        return tx.membership.update({
          where: { userId_teamId: { userId, teamId } },
          data: { role: parsed.data.role },
        })
      })
      return NextResponse.json(updated)
    } catch (err) {
      if (err instanceof LastOwnerError) return lastOwner()
      throw err
    }
  })
}

/**
 * Remove a member.
 *
 * Their assignments on that team's tasks go with them, in the SAME transaction (I4). A
 * deferred cleanup would leave a window where a non-member is still assigned, and I4 is an
 * invariant rather than a tendency. The tasks themselves survive — losing a person must not
 * lose the work (SC9).
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ teamId: string; userId: string }> }) {
  return handleErrors(async () => {
    const { teamId, userId } = await ctx.params
    const actor = await requireUser()
    await requireTeamOwner(actor.id, teamId)

    try {
      await prisma.$transaction(async (tx) => {
        await assertNotLastOwner(tx as unknown as typeof prisma, teamId, userId)

        await tx.taskAssignee.deleteMany({
          where: { userId, task: { column: { board: { teamId } } } },
        })
        await tx.membership.delete({ where: { userId_teamId: { userId, teamId } } })
      })
    } catch (err) {
      if (err instanceof LastOwnerError) return lastOwner()
      throw err
    }

    return NextResponse.json({ ok: true })
  })
}

const lastOwner = () =>
  apiError('LAST_OWNER', 409,
    'A team must keep at least one owner. Make someone else an owner first, or delete the team.')
