import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { PATCH as patchTask } from '@/app/api/tasks/[taskId]/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const move = (taskId: string, body: unknown) =>
  patchTask(
    new Request(`http://localhost/api/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ taskId }) },
  )

let todo: string
let doing: string

const layout = async (columnId: string) =>
  (await prisma.task.findMany({ where: { columnId }, orderBy: { position: 'asc' } }))
    .map((t) => `${t.position}:${t.title}`)

beforeEach(async () => {
  const owner = await makeUser()
  signedInAs((await createSession(owner.id)).token)
  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id)
  todo = board.columns[0].id
  doing = board.columns[1].id

  await prisma.task.createMany({
    data: [
      { columnId: todo, title: 'a', position: 0 },
      { columnId: todo, title: 'b', position: 1 },
      { columnId: todo, title: 'c', position: 2 },
      { columnId: doing, title: 'x', position: 0 },
      { columnId: doing, title: 'y', position: 1 },
    ],
  })
})

describe('T10 — moving within a column', () => {
  it('reorders and keeps positions dense (I5)', async () => {
    const c = await prisma.task.findFirstOrThrow({ where: { columnId: todo, title: 'c' } })
    expect((await move(c.id, { position: 0 })).status).toBe(200)
    expect(await layout(todo)).toEqual(['0:c', '1:a', '2:b'])
  })
})

describe('T10 — moving between columns', () => {
  it('leaves BOTH columns dense from 0 (I5)', async () => {
    const b = await prisma.task.findFirstOrThrow({ where: { columnId: todo, title: 'b' } })
    expect((await move(b.id, { columnId: doing, position: 1 })).status).toBe(200)

    // The source closes its hole...
    expect(await layout(todo)).toEqual(['0:a', '1:c'])
    // ...and the destination opens one at exactly the requested index.
    expect(await layout(doing)).toEqual(['0:x', '1:b', '2:y'])
  })

  it('appends to the destination when no position is given', async () => {
    const a = await prisma.task.findFirstOrThrow({ where: { columnId: todo, title: 'a' } })
    await move(a.id, { columnId: doing })
    expect(await layout(doing)).toEqual(['0:x', '1:y', '2:a'])
  })

  it('moves to the front of the destination', async () => {
    const a = await prisma.task.findFirstOrThrow({ where: { columnId: todo, title: 'a' } })
    await move(a.id, { columnId: doing, position: 0 })
    expect(await layout(doing)).toEqual(['0:a', '1:x', '2:y'])
  })

  it('SC3 — the move survives a reload: column and position are persisted, not remembered', async () => {
    const c = await prisma.task.findFirstOrThrow({ where: { columnId: todo, title: 'c' } })
    await move(c.id, { columnId: doing, position: 0 })

    // Read through a fresh query, exactly as a reload would.
    const reloaded = await prisma.task.findUniqueOrThrow({ where: { id: c.id } })
    expect(reloaded.columnId).toBe(doing)
    expect(reloaded.position).toBe(0)
  })

  it('REGRESSION: concurrent moves in one column do not 500 (P2034 write conflict)', async () => {
    // Found in verify's adversarial pass. Two reorders touching the same column conflict at
    // the database (P2034 TransactionWriteConflict). The abort itself is correct and safe —
    // no partial state, the invariant holds — but it surfaced to the caller as a 500.
    // Two people dragging cards on the same board at once is the core collaborative action
    // of this product, so this is the likeliest concurrent path there is.
    const tasks = await prisma.task.findMany({ where: { columnId: todo }, orderBy: { position: 'asc' } })
    const responses = await Promise.all(
      tasks.map((t, i) => move(t.id, { position: (i + 1) % tasks.length })),
    )
    for (const res of responses) {
      expect(res.status, `a concurrent move returned ${res.status}`).toBeLessThan(500)
    }
    // And the column is still dense afterwards, whichever order they landed in.
    const after = (await prisma.task.findMany({ where: { columnId: todo }, orderBy: { position: 'asc' } }))
      .map((t) => t.position)
    expect(after).toEqual(after.map((_, i) => i))
  })

  it('REGRESSION: concurrent moves across two columns do not 500', async () => {
    const tasks = await prisma.task.findMany({ where: { columnId: todo } })
    const responses = await Promise.all(
      tasks.map((t, i) => move(t.id, { columnId: i % 2 ? doing : todo, position: 0 })),
    )
    for (const res of responses) {
      expect(res.status, `a concurrent cross-column move returned ${res.status}`).toBeLessThan(500)
    }
    for (const col of [todo, doing]) {
      const ps = (await prisma.task.findMany({ where: { columnId: col }, orderBy: { position: 'asc' } })).map((t) => t.position)
      expect(ps).toEqual(ps.map((_, i) => i))
    }
    expect(await prisma.task.count({ where: { columnId: { in: [todo, doing] } } })).toBe(5)
  })

  it('never leaves a duplicate or a gap across a run of random moves', async () => {
    for (let i = 0; i < 10; i++) {
      const all = await prisma.task.findMany({ where: { columnId: { in: [todo, doing] } } })
      const pick = all[Math.floor(Math.random() * all.length)]
      const dest = Math.random() < 0.5 ? todo : doing
      const size = await prisma.task.count({ where: { columnId: dest } })
      await move(pick.id, { columnId: dest, position: Math.floor(Math.random() * (size + 1)) })

      for (const col of [todo, doing]) {
        const ps = (await prisma.task.findMany({ where: { columnId: col }, orderBy: { position: 'asc' } })).map((t) => t.position)
        expect(ps).toEqual(Array.from({ length: ps.length }, (_, i) => i))
      }
      // Nothing is ever lost in a move.
      expect(await prisma.task.count({ where: { columnId: { in: [todo, doing] } } })).toBe(5)
    }
  })
})
