import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { PATCH as patchTask, DELETE as deleteTask } from '@/app/api/tasks/[taskId]/route'
import { POST as createTask } from '@/app/api/columns/[columnId]/tasks/route'
import { POST as createColumn } from '@/app/api/boards/[boardId]/columns/route'
import { appendPosition } from '@/lib/ordering'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const json = (method: string, body?: unknown) =>
  new Request('http://localhost/x', {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const move = (taskId: string, body: unknown) =>
  patchTask(json('PATCH', body), { params: Promise.resolve({ taskId }) })

let boardId: string, src: string, dest: string

beforeEach(async () => {
  const owner = await makeUser()
  signedInAs((await createSession(owner.id)).token)
  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id)
  boardId = board.id
  src = board.columns[0].id
  dest = board.columns[1].id
})

const positionsIn = async (columnId: string) =>
  (await prisma.task.findMany({ where: { columnId }, orderBy: { position: 'asc' } })).map((t) => t.position)
const isDense = (p: number[]) => p.every((v, i) => v === i)

describe('C1 — concurrent moves never duplicate a position (I5)', () => {
  it('three concurrent position-less moves into one column stay dense', async () => {
    // Proven broken in review: this returned 200,200,200 with destination [0,0,1].
    await prisma.task.createMany({ data: [
      { columnId: src, title: 'x', position: 0 },
      { columnId: src, title: 'y', position: 1 },
      { columnId: src, title: 'z', position: 2 },
    ]})
    const tasks = await prisma.task.findMany({ where: { columnId: src } })

    const results = await Promise.all(tasks.map((t) => move(t.id, { columnId: dest })))
    for (const r of results) expect(r.status).toBeLessThan(500)

    const p = await positionsIn(dest)
    expect(new Set(p).size, `duplicates: [${p}]`).toBe(p.length)
    expect(isDense(p), `not dense: [${p}]`).toBe(true)
    expect(p.length).toBe(3)
    expect(await positionsIn(src)).toEqual([])
  })

  it('concurrent moves with explicit positions stay dense in BOTH columns', async () => {
    await prisma.task.createMany({ data: Array.from({ length: 6 }, (_, i) => ({
      columnId: src, title: `t${i}`, position: i,
    }))})
    const tasks = await prisma.task.findMany({ where: { columnId: src } })

    await Promise.all(tasks.map((t, i) =>
      move(t.id, i % 2 ? { columnId: dest, position: 0 } : { position: 0 })))

    for (const col of [src, dest]) {
      const p = await positionsIn(col)
      expect(isDense(p), `${col === src ? 'source' : 'destination'} not dense: [${p}]`).toBe(true)
    }
    expect((await positionsIn(src)).length + (await positionsIn(dest)).length).toBe(6)
  })

  it('concurrent CREATES in one column never collide', async () => {
    // The same class as the move bug: position computed outside the insert.
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      createTask(json('POST', { title: `c${i}` }), { params: Promise.resolve({ columnId: src }) })))
    for (const r of results) expect(r.status).toBe(201)

    const p = await positionsIn(src)
    expect(new Set(p).size, `duplicates: [${p}]`).toBe(p.length)
    expect(isDense(p), `not dense: [${p}]`).toBe(true)
  })

  it('concurrent COLUMN creates never collide either', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) =>
      createColumn(json('POST', { name: `col${i}` }), { params: Promise.resolve({ boardId }) })))
    for (const r of results) expect(r.status).toBe(201)

    const p = (await prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } })).map((c) => c.position)
    expect(new Set(p).size, `duplicates: [${p}]`).toBe(p.length)
    expect(isDense(p), `not dense: [${p}]`).toBe(true)
  })
})

describe('C2 — appendPosition does not collide with an existing position', () => {
  it('returns a free index even when the column has a gap', async () => {
    // Proven broken in review: returned 3 for [0,1,3].
    await prisma.task.createMany({ data: [
      { columnId: src, title: 'a', position: 0 },
      { columnId: src, title: 'b', position: 1 },
      { columnId: src, title: 'c', position: 3 },
    ]})
    const next = await appendPosition(prisma, 'task', { columnId: src })
    const existing = await positionsIn(src)
    expect(existing).toContain(3)
    expect(next, `appendPosition returned ${next}, which collides with ${existing}`).not.toBe(3)
    expect(next).toBeGreaterThan(3)
  })
})

describe('C3 — a cross-column move is all-or-nothing (spec.md line 236)', () => {
  it('a failure partway leaves BOTH columns exactly as they were', async () => {
    await prisma.task.createMany({ data: [
      { columnId: src, title: 'a', position: 0 },
      { columnId: src, title: 'b', position: 1 },
    ]})
    await prisma.task.createMany({ data: [{ columnId: dest, title: 'z', position: 0 }] })
    const before = { src: await positionsIn(src), dest: await positionsIn(dest) }
    const target = await prisma.task.findFirstOrThrow({ where: { columnId: src, position: 0 } })

    // Force the write to fail midway through the move transaction.
    const failing = prisma.$extends({
      query: { task: { update() { throw new Error('forced mid-move failure') } } },
    })
    const { moveAcross } = await import('@/lib/ordering')
    await expect(
      moveAcross(failing as unknown as typeof prisma, 'task', target.id,
        { columnId: src }, { columnId: dest }, 0),
    ).rejects.toThrow(/forced mid-move/)

    // Nothing moved, and neither column was left gapped.
    expect(await positionsIn(src)).toEqual(before.src)
    expect(await positionsIn(dest)).toEqual(before.dest)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: target.id } })).columnId).toBe(src)
  })

  it('deleting a task keeps the column dense', async () => {
    await prisma.task.createMany({ data: Array.from({ length: 4 }, (_, i) => ({
      columnId: src, title: `d${i}`, position: i,
    }))})
    const middle = await prisma.task.findFirstOrThrow({ where: { columnId: src, position: 1 } })
    await deleteTask(json('DELETE'), { params: Promise.resolve({ taskId: middle.id }) })
    expect(isDense(await positionsIn(src))).toBe(true)
  })
})
