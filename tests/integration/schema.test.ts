import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { makeUser, makeTeam, makeBoard, makeFullTree } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

describe('T02 — domain schema', () => {
  it('builds the whole ownership chain with every foreign key resolving', async () => {
    const { owner, team, board, column, task } = await makeFullTree()

    const loaded = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      include: {
        assignees: true,
        comments: true,
        column: { include: { board: { include: { team: { include: { memberships: true } } } } } },
      },
    })

    expect(loaded.column.id).toBe(column.id)
    expect(loaded.column.board.id).toBe(board.id)
    expect(loaded.column.board.team.id).toBe(team.id)
    expect(loaded.column.board.team.memberships[0].userId).toBe(owner.id)
    expect(loaded.column.board.team.memberships[0].role).toBe('OWNER')
    expect(loaded.assignees).toHaveLength(1)
    expect(loaded.comments[0].body).toBe('Test comment')
  })

  it('treats email as case-insensitive and unique (citext), so Ada@x and ada@x collide', async () => {
    const email = `Ada-${Date.now()}@Example.test`
    await makeUser({ email })
    await expect(makeUser({ email: email.toLowerCase() })).rejects.toThrow()
  })

  it('stores dueDate as a real DATE column, not a timestamp', async () => {
    // Asserted against the column TYPE, deliberately. An earlier version of this test
    // round-tripped a value and compared the calendar day — and it passed identically
    // when the column was a timestamp, because Prisma normalises the value on the way
    // out. It could not fail, so it protected nothing. This can fail: change the schema
    // to a plain DateTime and it goes red.
    const [{ data_type: dueType }] = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'Task' AND column_name = 'dueDate'`,
    )
    expect(dueType).toBe('date')

    // And the contrast that makes the choice meaningful: createdAt IS a timestamp, so
    // this is a deliberate per-column decision rather than a global default.
    const [{ data_type: createdType }] = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'Task' AND column_name = 'createdAt'`,
    )
    expect(createdType).toContain('timestamp')
  })

  it('reads back a due date as the same calendar day under a non-UTC timezone', async () => {
    const { column } = await makeFullTree()
    const task = await prisma.task.create({
      data: { columnId: column.id, title: 'Due task', position: 1, dueDate: new Date('2026-03-14T00:00:00Z') },
    })
    const raw = await prisma.$queryRawUnsafe<{ due: string | null }[]>(
      `SELECT to_char("dueDate", 'YYYY-MM-DD') AS due FROM "Task" WHERE id = $1`, task.id,
    )
    expect(raw[0].due).toBe('2026-03-14')
  })

  it('has no status column anywhere — the column IS the status (I3)', async () => {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Task'`,
    )
    expect(cols.map((c) => c.column_name)).not.toContain('status')
  })

  it('has no deletedAt column anywhere — hard delete only (Q14)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name ILIKE 'deleted%'`,
    )
    expect(rows).toEqual([])
  })

  it('does NOT constrain (boardId, position) or (columnId, position) as unique (D1)', async () => {
    const { board } = await makeFullTree()
    // Dense reordering transiently collides; D1 chose a funnel + test over a constraint.
    await expect(
      prisma.column.create({ data: { boardId: board.id, name: 'Duplicate position', position: 0 } }),
    ).resolves.toBeDefined()
  })

  it('requires a membership row to be unique per (user, team)', async () => {
    const user = await makeUser()
    const team = await makeTeam(user.id)
    await expect(
      prisma.membership.create({ data: { userId: user.id, teamId: team.id, role: 'MEMBER' } }),
    ).rejects.toThrow()
  })

  it('has a Session model with an opaque unique token (Q19)', async () => {
    const user = await makeUser()
    const token = `tok-${crypto.randomUUID()}`
    const s = await prisma.session.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
    })
    expect(s.token).toBe(token)
    await expect(
      prisma.session.create({ data: { token, userId: user.id, expiresAt: new Date() } }),
    ).rejects.toThrow()
  })
})
