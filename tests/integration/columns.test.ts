import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { POST as createColumn } from '@/app/api/boards/[boardId]/columns/route'
import { PATCH as patchColumn, DELETE as deleteColumn } from '@/app/api/columns/[columnId]/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

let boardId: string
let ownerToken: string
let outsiderToken: string

beforeEach(async () => {
  const owner = await makeUser()
  const outsider = await makeUser()
  ownerToken = (await createSession(owner.id)).token
  outsiderToken = (await createSession(outsider.id)).token
  const team = await makeTeam(owner.id)
  boardId = (await makeBoard(team.id)).id
  signedInAs(ownerToken)
})

const namesInOrder = async () =>
  (await prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } })).map((c) => c.name)
const positions = async () =>
  (await prisma.column.findMany({ where: { boardId }, orderBy: { position: 'asc' } })).map((c) => c.position)

describe('T08 — column create / rename / delete', () => {
  it('appends a new column at the end', async () => {
    const res = await createColumn(json(`/api/boards/${boardId}/columns`, 'POST', { name: 'Blocked' }), {
      params: Promise.resolve({ boardId }),
    })
    expect(res.status).toBe(201)
    expect(await namesInOrder()).toEqual(['To Do', 'In Progress', 'Done', 'Blocked'])
    expect(await positions()).toEqual([0, 1, 2, 3])
  })

  it('rejects an empty name with a stable code', async () => {
    const res = await createColumn(json(`/api/boards/${boardId}/columns`, 'POST', { name: '   ' }), {
      params: Promise.resolve({ boardId }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
  })

  it('renames a column', async () => {
    const col = await prisma.column.findFirstOrThrow({ where: { boardId, position: 0 } })
    const res = await patchColumn(json(`/api/columns/${col.id}`, 'PATCH', { name: 'Backlog' }), {
      params: Promise.resolve({ columnId: col.id }),
    })
    expect(res.status).toBe(200)
    expect(await namesInOrder()).toEqual(['Backlog', 'In Progress', 'Done'])
  })

  it('deletes a column and COMPACTS the remaining positions (I5)', async () => {
    const middle = await prisma.column.findFirstOrThrow({ where: { boardId, position: 1 } })
    const res = await deleteColumn(json(`/api/columns/${middle.id}`, 'DELETE'), {
      params: Promise.resolve({ columnId: middle.id }),
    })
    expect(res.status).toBe(200)
    // Without compaction this would be [0, 2] — a hole that breaks the dense invariant.
    expect(await positions()).toEqual([0, 1])
    expect(await namesInOrder()).toEqual(['To Do', 'Done'])
  })

  it('deleting a column destroys its tasks, their comments and assignments (I7)', async () => {
    const col = await prisma.column.findFirstOrThrow({ where: { boardId, position: 0 } })
    const owner = await prisma.user.findFirstOrThrow({
      where: { memberships: { some: { team: { boards: { some: { id: boardId } } } } } },
    })
    const task = await prisma.task.create({
      data: {
        columnId: col.id, title: 'Doomed', position: 0,
        assignees: { create: { userId: owner.id } },
        comments: { create: { authorId: owner.id, body: 'bye' } },
      },
    })

    await deleteColumn(json(`/api/columns/${col.id}`, 'DELETE'), { params: Promise.resolve({ columnId: col.id }) })

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull()
    expect(await prisma.comment.count({ where: { taskId: task.id } })).toBe(0)
    expect(await prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(0)
  })

  it('reports the task count so the confirmation can state what will be destroyed (I7)', async () => {
    const col = await prisma.column.findFirstOrThrow({ where: { boardId, position: 0 } })
    await prisma.task.createMany({
      data: [
        { columnId: col.id, title: 'a', position: 0 },
        { columnId: col.id, title: 'b', position: 1 },
      ],
    })
    const res = await deleteColumn(json(`/api/columns/${col.id}`, 'DELETE'), {
      params: Promise.resolve({ columnId: col.id }),
    })
    expect((await res.json()).deletedTaskCount).toBe(2)
  })
})

describe('T08 — column reorder through the API', () => {
  it('moves a column and keeps positions dense', async () => {
    const last = await prisma.column.findFirstOrThrow({ where: { boardId, position: 2 } })
    const res = await patchColumn(json(`/api/columns/${last.id}`, 'PATCH', { position: 0 }), {
      params: Promise.resolve({ columnId: last.id }),
    })
    expect(res.status).toBe(200)
    expect(await namesInOrder()).toEqual(['Done', 'To Do', 'In Progress'])
    expect(await positions()).toEqual([0, 1, 2])
  })
})

describe('T08 — every column route is membership-scoped (SC5)', () => {
  it('refuses create, rename and delete to a non-member with the shared 404', async () => {
    const col = await prisma.column.findFirstOrThrow({ where: { boardId, position: 0 } })
    signedInAs(outsiderToken)

    const create = await createColumn(json(`/api/boards/${boardId}/columns`, 'POST', { name: 'Sneaky' }), {
      params: Promise.resolve({ boardId }),
    })
    const rename = await patchColumn(json(`/api/columns/${col.id}`, 'PATCH', { name: 'Sneaky' }), {
      params: Promise.resolve({ columnId: col.id }),
    })
    const remove = await deleteColumn(json(`/api/columns/${col.id}`, 'DELETE'), {
      params: Promise.resolve({ columnId: col.id }),
    })

    for (const res of [create, rename, remove]) expect(res.status).toBe(404)
    // And nothing changed.
    expect(await namesInOrder()).toEqual(['To Do', 'In Progress', 'Done'])
  })
})
