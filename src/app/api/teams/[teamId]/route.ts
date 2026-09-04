import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireTeamOwner } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'

const patchTeamSchema = z.object({ name: z.string().trim().min(1).max(100) })

/** Rename. Owner only — `requireTeamOwner` refuses a plain member with the shared 404. */
export async function PATCH(request: Request, ctx: { params: Promise<{ teamId: string }> }) {
  return handleErrors(async () => {
    const { teamId } = await ctx.params
    const user = await requireUser()
    await requireTeamOwner(user.id, teamId)

    const parsed = patchTeamSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'A team needs a name.')

    return NextResponse.json(
      await prisma.team.update({ where: { id: teamId }, data: { name: parsed.data.name } }),
    )
  })
}

/** Delete. Cascades to boards → columns → tasks → assignments and comments (I7). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ teamId: string }> }) {
  return handleErrors(async () => {
    const { teamId } = await ctx.params
    const user = await requireUser()
    await requireTeamOwner(user.id, teamId)

    await prisma.team.delete({ where: { id: teamId } })
    return NextResponse.json({ ok: true })
  })
}
