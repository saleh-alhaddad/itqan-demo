import { prisma } from '@/lib/db'

/**
 * Test data builders. Every integration test builds its world through these so that a
 * schema change breaks one file rather than fifty, and so each test's setup reads as
 * intent ("a team with a board") rather than as a pile of inserts.
 */

let seq = 0
const uniq = (p: string) => `${p}-${Date.now()}-${seq++}-${Math.random().toString(36).slice(2, 8)}`

export async function makeUser(overrides: { email?: string; name?: string } = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${uniq('user')}@example.test`,
      name: overrides.name ?? 'Test Person',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$placeholder$placeholder',
    },
  })
}

/** A team owned by `owner`, with the owner's OWNER membership already in place. */
export async function makeTeam(ownerId: string, name = 'Test Team') {
  return prisma.team.create({
    data: { name, memberships: { create: { userId: ownerId, role: 'OWNER' } } },
  })
}

/** A board with the three starter columns, positioned densely from 0 (I5). */
export async function makeBoard(teamId: string, name = 'Test Board') {
  return prisma.board.create({
    data: {
      teamId,
      name,
      columns: {
        create: [
          { name: 'To Do', position: 0 },
          { name: 'In Progress', position: 1 },
          { name: 'Done', position: 2 },
        ],
      },
    },
    include: { columns: { orderBy: { position: 'asc' } } },
  })
}

/** The whole ownership chain in one call: user → team → board → columns → task → comment. */
export async function makeFullTree() {
  const owner = await makeUser()
  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id)
  const column = board.columns[0]
  const task = await prisma.task.create({
    data: {
      columnId: column.id,
      title: 'Test task',
      position: 0,
      assignees: { create: { userId: owner.id } },
      comments: { create: { authorId: owner.id, body: 'Test comment' } },
    },
  })
  return { owner, team, board, column, task }
}
