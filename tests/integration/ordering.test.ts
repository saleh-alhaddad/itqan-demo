import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { reorderWithin, appendPosition } from '@/lib/ordering'
import { makeFullTree, makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const positionsOf = async (boardId: string) =>
  (await prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } }))
    .map((c) => ({ name: c.name, position: c.position }))

async function aBoardWithColumns() {
  const owner = await makeUser()
  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id) // To Do(0), In Progress(1), Done(2)
  return board
}

describe('T08 — dense ordering (I5 / D1)', () => {
  it('appends at the next free position', async () => {
    const board = await aBoardWithColumns()
    const next = await appendPosition(prisma, 'column', { boardId: board.id })
    expect(next).toBe(3)
  })

  it('appends at 0 on an empty parent', async () => {
    const owner = await makeUser()
    const team = await makeTeam(owner.id)
    const empty = await prisma.board.create({ data: { teamId: team.id, name: 'Empty' } })
    expect(await appendPosition(prisma, 'column', { boardId: empty.id })).toBe(0)
  })

  it('moving the LAST column to the front leaves positions exactly 0..n-1', async () => {
    const board = await aBoardWithColumns()
    const before = await positionsOf(board.id)
    const done = before[2]

    const doneRow = await prisma.column.findFirstOrThrow({ where: { boardId: board.id, name: done.name } })
    await reorderWithin(prisma, 'column', { boardId: board.id }, doneRow.id, 0)

    const after = await positionsOf(board.id)
    expect(after.map((c) => c.position)).toEqual([0, 1, 2])       // dense, no gaps
    expect(after.map((c) => c.name)).toEqual(['Done', 'To Do', 'In Progress'])
  })

  it('moving the FIRST column to the end leaves positions exactly 0..n-1', async () => {
    const board = await aBoardWithColumns()
    const first = await prisma.column.findFirstOrThrow({ where: { boardId: board.id, position: 0 } })
    await reorderWithin(prisma, 'column', { boardId: board.id }, first.id, 2)

    const after = await positionsOf(board.id)
    expect(after.map((c) => c.position)).toEqual([0, 1, 2])
    expect(after.map((c) => c.name)).toEqual(['In Progress', 'Done', 'To Do'])
  })

  it('a move to its current position is a no-op, not a corruption', async () => {
    const board = await aBoardWithColumns()
    const before = await positionsOf(board.id)
    const middle = await prisma.column.findFirstOrThrow({ where: { boardId: board.id, position: 1 } })
    await reorderWithin(prisma, 'column', { boardId: board.id }, middle.id, 1)
    expect(await positionsOf(board.id)).toEqual(before)
  })

  it('clamps an out-of-range target instead of leaving a gap', async () => {
    const board = await aBoardWithColumns()
    const first = await prisma.column.findFirstOrThrow({ where: { boardId: board.id, position: 0 } })
    await reorderWithin(prisma, 'column', { boardId: board.id }, first.id, 99)
    expect((await positionsOf(board.id)).map((c) => c.position)).toEqual([0, 1, 2])
    expect((await positionsOf(board.id))[2].name).toBe('To Do')
  })

  it('never produces duplicate positions, across a run of random moves', async () => {
    const board = await aBoardWithColumns()
    for (let i = 0; i < 12; i++) {
      const cols = await prisma.column.findMany({ where: { boardId: board.id } })
      const pick = cols[Math.floor(Math.random() * cols.length)]
      await reorderWithin(prisma, 'column', { boardId: board.id }, pick.id, Math.floor(Math.random() * cols.length))

      const positions = (await positionsOf(board.id)).map((c) => c.position)
      // D1 removed the unique constraint, so this assertion IS the guarantee.
      expect(positions).toEqual([0, 1, 2])
      expect(new Set(positions).size).toBe(positions.length)
    }
  })

  it('leaves the original order intact when the transaction fails partway', async () => {
    const board = await aBoardWithColumns()
    const before = await positionsOf(board.id)
    const target = await prisma.column.findFirstOrThrow({ where: { boardId: board.id, position: 2 } })

    const failing = prisma.$extends({
      query: { column: { update() { throw new Error('forced failure mid-reorder') } } },
    })
    await expect(
      reorderWithin(failing as unknown as typeof prisma, 'column', { boardId: board.id }, target.id, 0),
    ).rejects.toThrow(/forced failure/)

    expect(await positionsOf(board.id)).toEqual(before)
  })

  it('works for tasks too — one funnel, reused by T10', async () => {
    const { column } = await makeFullTree()
    await prisma.task.createMany({
      data: [
        { columnId: column.id, title: 'B', position: 1 },
        { columnId: column.id, title: 'C', position: 2 },
      ],
    })
    const c = await prisma.task.findFirstOrThrow({ where: { columnId: column.id, title: 'C' } })
    await reorderWithin(prisma, 'task', { columnId: column.id }, c.id, 0)

    const tasks = await prisma.task.findMany({ where: { columnId: column.id }, orderBy: { position: 'asc' } })
    expect(tasks.map((t) => t.position)).toEqual([0, 1, 2])
    expect(tasks[0].title).toBe('C')
  })
})
