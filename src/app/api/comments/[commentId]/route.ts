import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser, requireCommentAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'

/**
 * Delete a comment: the AUTHOR or the TEAM OWNER, nobody else (SC6).
 *
 * The rule is expressed once, here. Splitting it between a UI condition and a server
 * condition is how the two drift, and the one that drifts is always the UI — which is the
 * half that is not the boundary.
 *
 * Note the two different refusals, deliberately:
 *  - a NON-MEMBER gets the shared 404, because they must not learn the comment exists;
 *  - a member who is neither author nor owner gets 403, because they can already see it.
 *    Pretending it is absent would be a lie they can disprove by looking at the screen.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ commentId: string }> }) {
  return handleErrors(request, async () => {
    const { commentId } = await ctx.params
    const actor = await requireUser()

    // Throws the shared 404 for a non-member and an absent comment alike.
    const comment = await requireCommentAccess(actor.id, commentId)

    const isAuthor = comment.authorId === actor.id
    const isTeamOwner = await prisma.membership.count({
      where: { userId: actor.id, teamId: comment.task.column.board.teamId, role: 'OWNER' },
    })

    if (!isAuthor && isTeamOwner === 0) {
      return apiError('FORBIDDEN', 403, 'Only the person who wrote a comment, or a team owner, can delete it.')
    }

    await prisma.comment.delete({ where: { id: commentId } })
    return NextResponse.json({ ok: true })
  })
}
