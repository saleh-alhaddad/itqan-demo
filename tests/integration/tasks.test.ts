import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { POST as createTask } from '@/app/api/columns/[columnId]/tasks/route'
import { PATCH as patchTask, DELETE as deleteTask } from '@/app/api/tasks/[taskId]/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

let columnId: string
let otherColumnId: string
let memberToken: string
let outsiderToken: string

beforeEach(async () => {
  const owner = await makeUser()
  const member = await makeUser()
  const outsider = await makeUser()
  memberToken = (await createSession(member.id)).token
  outsiderToken = (await createSession(outsider.id)).token

  const team = await makeTeam(owner.id)
  await prisma.membership.create({ data: { userId: member.id, teamId: team.id, role: 'MEMBER' } })
  const board = await makeBoard(team.id)
  columnId = board.columns[0].id
  otherColumnId = board.columns[1].id
  signedInAs(memberToken)
})

const titlesIn = async (id: string) =>
  (await prisma.task.findMany({ where: { columnId: id }, orderBy: { position: 'asc' } })).map((t) => t.title)

describe('T09 — task create', () => {
  it('creates with a title alone; everything else is optional', async () => {
    const res = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title: 'Write the thing' }), {
      params: Promise.resolve({ columnId }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.title).toBe('Write the thing')
    expect(body.description).toBeNull()
    expect(body.dueDate).toBeNull()
    expect(body.position).toBe(0)
  })

  it('appends at the end of the column', async () => {
    for (const title of ['one', 'two', 'three']) {
      await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title }), {
        params: Promise.resolve({ columnId }),
      })
    }
    expect(await titlesIn(columnId)).toEqual(['one', 'two', 'three'])
    const positions = (await prisma.task.findMany({ where: { columnId }, orderBy: { position: 'asc' } })).map((t) => t.position)
    expect(positions).toEqual([0, 1, 2])
  })

  it('rejects an empty or whitespace-only title with a stable code', async () => {
    for (const title of ['', '   ', undefined]) {
      const res = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title }), {
        params: Promise.resolve({ columnId }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('INVALID_INPUT')
    }
    expect(await titlesIn(columnId)).toEqual([])
  })

  it('REGRESSION: a null byte in the title is rejected as 400, not a 500', async () => {
    // Found in verify's adversarial pass. Postgres text cannot hold U+0000, so the insert
    // failed with P2039 (invalid byte sequence for encoding UTF8) and surfaced as a 500 —
    // a trivially reachable unhandled error. The validation boundary accepted a character
    // the storage layer cannot represent.
    const withNul = `before${String.fromCharCode(0)}after`
    const res = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title: withNul }), {
      params: Promise.resolve({ columnId }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
    expect(await titlesIn(columnId)).toEqual([])
  })

  it('REGRESSION: a null byte in the description is rejected too', async () => {
    const res = await createTask(
      json(`/api/columns/${columnId}/tasks`, 'POST', { title: 'ok', description: `a${String.fromCharCode(0)}b` }),
      { params: Promise.resolve({ columnId }) },
    )
    expect(res.status).toBe(400)
  })

  it('a non-member cannot create a task, and gets the shared 404', async () => {
    signedInAs(outsiderToken)
    const res = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title: 'Sneaky' }), {
      params: Promise.resolve({ columnId }),
    })
    expect(res.status).toBe(404)
    expect(await titlesIn(columnId)).toEqual([])
  })
})

describe('T09 — task edit', () => {
  const aTask = async (title = 'Editable') => {
    const res = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title }), {
      params: Promise.resolve({ columnId }),
    })
    return (await res.json()) as { id: string }
  }

  it('edits the title and description', async () => {
    const task = await aTask()
    const res = await patchTask(json(`/api/tasks/${task.id}`, 'PATCH', { title: 'Edited', description: 'Some detail' }), {
      params: Promise.resolve({ taskId: task.id }),
    })
    expect(res.status).toBe(200)
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect(row.title).toBe('Edited')
    expect(row.description).toBe('Some detail')
  })

  it('clears a description back to null', async () => {
    const task = await aTask()
    await patchTask(json(`/api/tasks/${task.id}`, 'PATCH', { description: 'temp' }), { params: Promise.resolve({ taskId: task.id }) })
    await patchTask(json(`/api/tasks/${task.id}`, 'PATCH', { description: null }), { params: Promise.resolve({ taskId: task.id }) })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).description).toBeNull()
  })

  it('refuses to blank the title — a card with no title is unreadable', async () => {
    const task = await aTask()
    const res = await patchTask(json(`/api/tasks/${task.id}`, 'PATCH', { title: '   ' }), {
      params: Promise.resolve({ taskId: task.id }),
    })
    expect(res.status).toBe(400)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe('Editable')
  })

  it('a non-member cannot edit, and nothing changes', async () => {
    const task = await aTask()
    signedInAs(outsiderToken)
    const res = await patchTask(json(`/api/tasks/${task.id}`, 'PATCH', { title: 'Hijacked' }), {
      params: Promise.resolve({ taskId: task.id }),
    })
    expect(res.status).toBe(404)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title).toBe('Editable')
  })
})

describe('T09 — task delete (SC6: ANY member may delete)', () => {
  it('lets a plain MEMBER delete a task, and compacts the column', async () => {
    for (const title of ['a', 'b', 'c']) {
      await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title }), { params: Promise.resolve({ columnId }) })
    }
    const middle = await prisma.task.findFirstOrThrow({ where: { columnId, position: 1 } })

    const res = await deleteTask(json(`/api/tasks/${middle.id}`, 'DELETE'), { params: Promise.resolve({ taskId: middle.id }) })
    expect(res.status).toBe(200)

    expect(await titlesIn(columnId)).toEqual(['a', 'c'])
    const positions = (await prisma.task.findMany({ where: { columnId }, orderBy: { position: 'asc' } })).map((t) => t.position)
    expect(positions).toEqual([0, 1])   // no hole left behind (I5)
  })

  it('a non-member cannot delete', async () => {
    const res0 = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title: 'Safe' }), {
      params: Promise.resolve({ columnId }),
    })
    const task = (await res0.json()) as { id: string }
    signedInAs(outsiderToken)
    expect((await deleteTask(json(`/api/tasks/${task.id}`, 'DELETE'), { params: Promise.resolve({ taskId: task.id }) })).status).toBe(404)
    expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull()
  })
})

describe('T09 — a move cannot cross a team boundary', () => {
  it('refuses to move a task into a column the actor cannot reach', async () => {
    // The actor is a member of THIS team...
    const res0 = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title: 'Stays put' }), {
      params: Promise.resolve({ columnId }),
    })
    const task = (await res0.json()) as { id: string }

    // ...and a completely separate team owns this column.
    const stranger = await makeUser()
    const strangerTeam = await makeTeam(stranger.id)
    const strangerBoard = await makeBoard(strangerTeam.id)
    const foreignColumnId = strangerBoard.columns[0].id

    const res = await patchTask(json(`/api/tasks/${task.id}`, 'PATCH', { columnId: foreignColumnId }), {
      params: Promise.resolve({ taskId: task.id }),
    })

    // Without the destination check, this would silently drop the task into another team's
    // board — a write across a boundary that every read is careful to respect.
    expect(res.status).toBe(404)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).columnId).toBe(columnId)
    expect(await prisma.task.count({ where: { columnId: foreignColumnId } })).toBe(0)
  })
})

describe('T09 — I3: the column IS the status', () => {
  it('a task always belongs to exactly one column, and no status is stored', async () => {
    const res = await createTask(json(`/api/columns/${columnId}/tasks`, 'POST', { title: 'Placed' }), {
      params: Promise.resolve({ columnId }),
    })
    const body = await res.json()
    expect(body.columnId).toBe(columnId)
    expect(body).not.toHaveProperty('status')
    expect(otherColumnId).not.toBe(body.columnId)
  })
})
