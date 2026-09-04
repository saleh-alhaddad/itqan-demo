import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireTeamOwner } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'

const addMemberSchema = z.object({ email: z.email().max(254) })

/**
 * Add a member by looking up an existing account (SC7).
 *
 * A miss returns an EXPLICIT `NO_SUCH_ACCOUNT` rather than the shared 404. That is
 * deliberate and it is the one place this API is chatty: the alternative is an owner typing
 * an address, seeing nothing happen, and being unable to tell a typo from a person who
 * never signed up. The spec records that this doubles as an enumeration oracle, and
 * `harden` is tasked with reconciling the two.
 *
 * There are no invitations: the MVP sends no email, so a person must already have an account.
 */
export async function POST(request: Request, ctx: { params: Promise<{ teamId: string }> }) {
  return handleErrors(async () => {
    const { teamId } = await ctx.params
    const actor = await requireUser()
    await requireTeamOwner(actor.id, teamId)

    const parsed = addMemberSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'Enter an email address.')

    // citext, so a differently-cased address finds the same account.
    const person = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!person) {
      return apiError('NO_SUCH_ACCOUNT', 404,
        'No account with that email. They need to sign up first — invitations are not available.')
    }

    // Idempotent: adding someone already on the team is a no-op, not an error. An owner
    // re-adding a person should not have to care whether it already worked.
    await prisma.membership.upsert({
      where: { userId_teamId: { userId: person.id, teamId } },
      create: { userId: person.id, teamId, role: 'MEMBER' },
      update: {},
    })

    return NextResponse.json({ ok: true, userId: person.id, name: person.name })
  })
}
