import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { ApiError } from '@/lib/api/errors'
import { readSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'

/**
 * The authorization funnel (decision D2). Every board-scoped route resolves access through
 * one of these.
 *
 * They RETURN THE FETCHED RESOURCE rather than answering a boolean, and that is the whole
 * design. A `canAccess()` helper would be equally correct and equally forgettable: a new
 * endpoint could obtain a board without ever calling it, and the resulting hole looks like
 * a working feature rather than a failure. Here the only way to get the board is to pass
 * the check.
 *
 * Because the guards fetch, callers must NOT re-query the resource they were handed.
 *
 * Every refusal is the same `NOT_FOUND` (I2): "you may not see this" and "this does not
 * exist" are indistinguishable, so the API never confirms that another team's ids are real.
 * That includes a member who lacks the OWNER role — a 403 there would confirm the team
 * exists, which is more than a refusal should say.
 */
const deny = () => new ApiError('NOT_FOUND', 404, 'Not found')

/** The signed-in user, or null. Next 16: cookies() is async and must be awaited. */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  const session = await readSession(token)
  return session?.user ?? null
}

/** Distinct from `deny()`: "you are not signed in" is not a leak, it is the sign-in prompt. */
export async function requireUser() {
  const user = await currentUser()
  if (!user) throw new ApiError('UNAUTHENTICATED', 401, 'Sign in to continue.')
  return user
}

export async function requireTeamMember(userId: string, teamId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
    include: { team: true },
  })
  if (!membership) throw deny()
  return membership
}

export async function requireTeamOwner(userId: string, teamId: string) {
  const membership = await requireTeamMember(userId, teamId)
  if (membership.role !== 'OWNER') throw deny()
  return membership
}

/**
 * I2 in one query: the board is returned only if a Membership row joins the actor to the
 * board's team. There is no second ownership path to remember.
 */
export async function requireBoardAccess(userId: string, boardId: string) {
  const board = await prisma.board.findFirst({
    where: { id: boardId, team: { memberships: { some: { userId } } } },
    include: { team: true },
  })
  if (!board) throw deny()
  return board
}

/**
 * Walks task -> column -> board -> team. There is deliberately no denormalised teamId on
 * Task: one ownership path cannot disagree with itself.
 */
export async function requireTaskAccess(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, column: { board: { team: { memberships: { some: { userId } } } } } },
    include: { column: { include: { board: true } } },
  })
  if (!task) throw deny()
  return task
}

export async function requireColumnAccess(userId: string, columnId: string) {
  const column = await prisma.column.findFirst({
    where: { id: columnId, board: { team: { memberships: { some: { userId } } } } },
    include: { board: true },
  })
  if (!column) throw deny()
  return column
}

export async function requireCommentAccess(userId: string, commentId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, task: { column: { board: { team: { memberships: { some: { userId } } } } } } },
    include: { task: { include: { column: { include: { board: true } } } } },
  })
  if (!comment) throw deny()
  return comment
}
