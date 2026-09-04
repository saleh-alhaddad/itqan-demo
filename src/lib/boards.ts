import { prisma } from '@/lib/db'

/**
 * The board payload, shared by `GET /api/boards/:id` and the server-rendered board page.
 *
 * Takes the ACTOR, not just the board id, and returns null when they are not a member —
 * so authorization cannot be forgotten at a call site.
 *
 * One definition on purpose: if the page and the poll returned different shapes, the board
 * would visibly change the first time it refreshed.
 *
 * `select` throughout, never `include` — an include on assignees would ship every User
 * column, one of which is the password hash. Comment COUNTS, not bodies, because the poll
 * re-fetches this every ten seconds (SC10).
 */
export async function loadBoardFor(userId: string, boardId: string) {
  const board = await prisma.board.findFirst({
    // The membership predicate is IN THE QUERY, not in a separate check the caller might
    // skip. This is decision D2 applied to reads: there is no way to obtain board data
    // without proving membership, because the two are the same statement.
    //
    // A layout-level check is NOT a substitute. Next renders a layout and its page
    // CONCURRENTLY: a page that queried unscoped data serialised it into the RSC flight
    // payload even when the layout threw notFound() — the response carried a 404 status
    // and the board's contents. That was a real leak, found by a browser test asserting
    // the status code.
    where: { id: boardId, team: { memberships: { some: { userId } } } },
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
              assignees: { select: { user: { select: { id: true, name: true, email: true } } } },
              _count: { select: { comments: true } },
            },
          },
        },
      },
    },
  })

  if (!board) return null

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

export type BoardPayload = NonNullable<Awaited<ReturnType<typeof loadBoardFor>>>
