import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

/**
 * SC8 / I7. Seeds a FULL tree and deletes at each level, asserting no orphan survives.
 *
 * Mostly a proving task: the cascades are declared on the schema (T02), so this checks that
 * the declaration is true rather than implementing it. Finding a missing cascade here, with
 * the whole tree seeded, is far cheaper than finding it after release.
 */
async function seedTree() {
  const owner = await makeUser()
  const helper = await makeUser()
  const team = await makeTeam(owner.id)
  await prisma.membership.create({ data: { userId: helper.id, teamId: team.id, role: 'MEMBER' } })

  const boards = [await makeBoard(team.id, 'One'), await makeBoard(team.id, 'Two')]
  const taskIds: string[] = []
  for (const board of boards) {
    for (const column of board.columns) {
      for (let i = 0; i < 2; i++) {
        const task = await prisma.task.create({
          data: {
            columnId: column.id, title: `t${i}`, position: i,
            assignees: { create: [{ userId: owner.id }, { userId: helper.id }] },
            comments: { create: [{ authorId: owner.id, body: 'a' }, { authorId: helper.id, body: 'b' }] },
          },
        })
        taskIds.push(task.id)
      }
    }
  }
  return { owner, helper, team, boards, taskIds }
}

const counts = async (teamId: string, taskIds: string[]) => ({
  boards: await prisma.board.count({ where: { teamId } }),
  columns: await prisma.column.count({ where: { board: { teamId } } }),
  tasks: await prisma.task.count({ where: { id: { in: taskIds } } }),
  assignees: await prisma.taskAssignee.count({ where: { taskId: { in: taskIds } } }),
  comments: await prisma.comment.count({ where: { taskId: { in: taskIds } } }),
})

describe('T16 — deletion cascades leave no orphans (SC8 / I7)', () => {
  it('the seed itself is a full tree, or the test proves nothing', async () => {
    const { team, taskIds } = await seedTree()
    const c = await counts(team.id, taskIds)
    expect(c).toEqual({ boards: 2, columns: 6, tasks: 12, assignees: 24, comments: 24 })
  })

  it('deleting a COLUMN removes its tasks, assignments and comments', async () => {
    const { boards, taskIds } = await seedTree()
    const column = boards[0].columns[0]
    const doomed = (await prisma.task.findMany({ where: { columnId: column.id } })).map((t) => t.id)

    await prisma.column.delete({ where: { id: column.id } })

    expect(await prisma.task.count({ where: { id: { in: doomed } } })).toBe(0)
    expect(await prisma.taskAssignee.count({ where: { taskId: { in: doomed } } })).toBe(0)
    expect(await prisma.comment.count({ where: { taskId: { in: doomed } } })).toBe(0)
    // Its siblings are untouched — a cascade must not over-reach.
    expect(await prisma.task.count({ where: { id: { in: taskIds } } })).toBe(10)
  })

  it('deleting a BOARD removes its columns, tasks, assignments and comments', async () => {
    const { team, boards, taskIds } = await seedTree()
    await prisma.board.delete({ where: { id: boards[0].id } })

    expect(await prisma.column.count({ where: { boardId: boards[0].id } })).toBe(0)
    const c = await counts(team.id, taskIds)
    expect(c).toEqual({ boards: 1, columns: 3, tasks: 6, assignees: 12, comments: 12 })
  })

  it('deleting a TEAM removes everything beneath it', async () => {
    const { team, taskIds } = await seedTree()
    await prisma.team.delete({ where: { id: team.id } })

    expect(await counts(team.id, taskIds)).toEqual({
      boards: 0, columns: 0, tasks: 0, assignees: 0, comments: 0,
    })
    expect(await prisma.membership.count({ where: { teamId: team.id } })).toBe(0)
  })

  it('deleting a USER removes their memberships, assignments and comments', async () => {
    const { helper, taskIds } = await seedTree()
    await prisma.user.delete({ where: { id: helper.id } })

    expect(await prisma.membership.count({ where: { userId: helper.id } })).toBe(0)
    expect(await prisma.taskAssignee.count({ where: { userId: helper.id } })).toBe(0)
    expect(await prisma.comment.count({ where: { authorId: helper.id } })).toBe(0)
    // The tasks they touched survive — losing a person must not lose the work.
    expect(await prisma.task.count({ where: { id: { in: taskIds } } })).toBe(12)
  })

  it('no orphan rows exist anywhere in the database after all of that', async () => {
    // The general form of SC8: whatever any test above deleted, nothing may point at a
    // parent that is gone. Asserted against the whole schema, not one tree.
    const orphans = await prisma.$queryRawUnsafe<{ kind: string; n: bigint }[]>(`
      SELECT 'column'   AS kind, count(*) AS n FROM "Column" c   LEFT JOIN "Board" b ON b.id = c."boardId"  WHERE b.id IS NULL
      UNION ALL SELECT 'task',   count(*) FROM "Task" t          LEFT JOIN "Column" c ON c.id = t."columnId" WHERE c.id IS NULL
      UNION ALL SELECT 'assignee', count(*) FROM "TaskAssignee" a LEFT JOIN "Task" t ON t.id = a."taskId"    WHERE t.id IS NULL
      UNION ALL SELECT 'comment', count(*) FROM "Comment" cm     LEFT JOIN "Task" t ON t.id = cm."taskId"    WHERE t.id IS NULL
      UNION ALL SELECT 'board',   count(*) FROM "Board" b2       LEFT JOIN "Team" tm ON tm.id = b2."teamId"  WHERE tm.id IS NULL
      UNION ALL SELECT 'membership', count(*) FROM "Membership" m LEFT JOIN "Team" tm2 ON tm2.id = m."teamId" WHERE tm2.id IS NULL
      UNION ALL SELECT 'session', count(*) FROM "Session" s      LEFT JOIN "User" u ON u.id = s."userId"     WHERE u.id IS NULL
    `)
    for (const row of orphans) {
      expect(Number(row.n), `${row.kind} orphans`).toBe(0)
    }
  })

  it('HARD DELETE only — no soft-delete column exists anywhere (Q14)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (column_name ILIKE 'deleted%' OR column_name ILIKE 'archived%' OR column_name ILIKE 'is_deleted')`,
    )
    expect(rows).toEqual([])
  })
})
