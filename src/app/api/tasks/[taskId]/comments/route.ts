import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requiredText } from '@/lib/api/validation'
import { prisma } from '@/lib/db'
import { requireUser, requireTaskAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'

const commentSchema = z.object({ body: requiredText(5000) })

/**
 * Comments on a task. Flat and plain text: threading, mentions, reactions and markdown are
 * all named exclusions in the spec.
 *
 * Bodies live here rather than on the board payload, because the board is re-fetched every
 * ten seconds and shipping every comment with it would grow that response without bound.
 * The board carries counts; the dialog fetches the text.
 *
 * That reasoning only holds if THIS endpoint is bounded too. It was not — a review found an
 * unbounded `findMany`, so a busy card returned every comment it had ever collected and the
 * dialog rendered all of them. It now returns the most recent page, oldest-first for
 * reading, and says plainly when there are older ones it did not send.
 */
const COMMENT_PAGE_SIZE = 100
export async function GET(request: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleErrors(request, async () => {
    const { taskId } = await ctx.params
    const actor = await requireUser()
    await requireTaskAccess(actor.id, taskId)

    const total = await prisma.comment.count({ where: { taskId } })
    // Newest first to take the page, then reversed for display: a thread reads oldest-first,
    // but the page worth keeping is the most recent one.
    const page = await prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      take: COMMENT_PAGE_SIZE,
      // `select`, never `include`: an include would ship the author's password hash.
      select: {
        id: true, body: true, createdAt: true, authorId: true,
        author: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      comments: page.reverse(),
      total,
      // The client says so rather than silently showing a partial thread as if it were whole.
      olderHidden: Math.max(0, total - page.length),
    })
  })
}

export async function POST(request: Request, ctx: { params: Promise<{ taskId: string }> }) {
  return handleErrors(request, async () => {
    const { taskId } = await ctx.params
    const actor = await requireUser()
    await requireTaskAccess(actor.id, taskId)

    const parsed = commentSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'A comment needs some text.')

    // Stored verbatim. It is rendered as text, never as markup, so escaping here would
    // corrupt anyone who legitimately writes an angle bracket.
    const comment = await prisma.comment.create({
      data: { taskId, authorId: actor.id, body: parsed.data.body },
      select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { id: true, name: true } } },
    })
    return NextResponse.json(comment, { status: 201 })
  })
}
