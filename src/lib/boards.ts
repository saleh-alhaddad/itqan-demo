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
      // The roster the assignee picker offers. Scoped to this board's team, so the UI
      // cannot present a person the server would then reject (I4).
      team: { select: { memberships: { select: { role: true, user: { select: { id: true, name: true, email: true } } } } } },
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

  const { team, ...rest } = board
  return {
    ...rest,
    members: team.memberships.map((m) => m.user),
    viewerIsOwner: team.memberships.some((m) => m.user.id === userId && m.role === 'OWNER'),
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

/**
 * Every board the actor can reach, grouped by the team that owns it.
 *
 * This is where login lands, so it must never throw for an ordinary account — including one
 * with no teams at all, which returns an empty list rather than an error.
 *
 * Scoped by membership in the query, like every other team-scoped read: the actor's own
 * `Membership` rows are the starting point, so a board from a team they do not belong to
 * cannot appear no matter what the caller does.
 */
export async function listBoardsFor(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          name: true,
          boards: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } },
        },
      },
    },
  })

  return memberships.map(({ role, team }) => ({
    id: team.id,
    name: team.name,
    role,
    boards: team.boards,
  }))
}
