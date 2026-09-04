import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser, requireBoardAccess } from '@/lib/auth/guard'
import { handleErrors } from '@/lib/api/errors'

/**
 * The board payload. This is the endpoint the 10-second poll re-fetches (SC10), so its
 * size is the thing to watch: it ships comment COUNTS rather than comment bodies, and only
 * the assignee fields the card needs. If poll volume ever becomes a problem, the spec's
 * mitigation is a cheap changed-since check in front of this — not a switch to websockets.
 */
export const dynamic = 'force-dynamic'

export type BoardPayload = Awaited<ReturnType<typeof loadBoard>>

async function loadBoard(boardId: string) {
  const board = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    select: {
      id: true,
      name: true,
      teamId: true,
      columns: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          position: true,
          tasks: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              dueDate: true,
              position: true,
              columnId: true,
              // `select` rather than `include` throughout: an include would ship every
              // User column, and one of them is the password hash.
              assignees: { select: { user: { select: { id: true, name: true, email: true } } } },
              _count: { select: { comments: true } },
            },
          },
        },
      },
    },
  })

  // Flatten the join rows and the _count into the shape the card actually renders, so the
  // client never has to know about TaskAssignee or Prisma's aggregate naming.
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      tasks: column.tasks.map(({ _count, assignees, ...task }) => ({
        ...task,
        assignees: assignees.map((a) => a.user),
        commentCount: _count.comments,
      })),
    })),
  }
}

export async function GET(_request: Request, ctx: { params: Promise<{ boardId: string }> }) {
  return handleErrors(async () => {
    // Next 16: params is a Promise. Reading it without awaiting compiles cleanly and is broken.
    const { boardId } = await ctx.params
    const user = await requireUser()

    // The guard is the only way to establish access; it throws the shared NOT_FOUND for a
    // non-member and for an absent board alike (I2/SC5).
    await requireBoardAccess(user.id, boardId)

    return NextResponse.json(await loadBoard(boardId))
  })
}
