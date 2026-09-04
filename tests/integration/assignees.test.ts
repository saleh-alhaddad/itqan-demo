import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { PUT as putAssignees } from '@/app/api/tasks/[taskId]/assignees/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const put = (taskId: string, userIds: string[]) =>
  putAssignees(
    new Request(`http://localhost/api/tasks/${taskId}/assignees`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userIds }),
    }),
    { params: Promise.resolve({ taskId }) },
  )

let owner: Awaited<ReturnType<typeof makeUser>>
let member: Awaited<ReturnType<typeof makeUser>>
let stranger: Awaited<ReturnType<typeof makeUser>>
let taskId: string
let teamId: string

beforeEach(async () => {
  owner = await makeUser()
  member = await makeUser()
  stranger = await makeUser()
  signedInAs((await createSession(owner.id)).token)

  const team = await makeTeam(owner.id)
  teamId = team.id
  await prisma.membership.create({ data: { userId: member.id, teamId, role: 'MEMBER' } })
  const board = await makeBoard(teamId)
  taskId = (await prisma.task.create({ data: { columnId: board.columns[0].id, title: 'Work', position: 0 } })).id
})

const assignedIds = async () =>
  (await prisma.taskAssignee.findMany({ where: { taskId } })).map((a) => a.userId).sort()

describe('T13 — assignee containment (I4 / SC9)', () => {
  it('assigns zero, one, and several team members', async () => {
    expect((await put(taskId, [])).status).toBe(200)
    expect(await assignedIds()).toEqual([])

    expect((await put(taskId, [owner.id])).status).toBe(200)
    expect(await assignedIds()).toEqual([owner.id].sort())

    expect((await put(taskId, [owner.id, member.id])).status).toBe(200)
    expect(await assignedIds()).toEqual([owner.id, member.id].sort())
  })

  it('REJECTS a user who is not a member of the owning team (I4)', async () => {
    const res = await put(taskId, [stranger.id])
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('NOT_A_MEMBER')
    expect(await assignedIds()).toEqual([])
  })

  it('rejects the whole set if ANY user is not a member — no partial application', async () => {
    const res = await put(taskId, [owner.id, stranger.id])
    expect(res.status).toBe(400)
    // The valid half must not have been written: a rejected request changes nothing.
    expect(await assignedIds()).toEqual([])
  })

  it('replaces the set rather than appending to it', async () => {
    await put(taskId, [owner.id, member.id])
    await put(taskId, [member.id])
    expect(await assignedIds()).toEqual([member.id])
  })

  it('is idempotent — the same set twice leaves one row per person', async () => {
    await put(taskId, [owner.id, member.id])
    await put(taskId, [owner.id, member.id])
    expect(await prisma.taskAssignee.count({ where: { taskId } })).toBe(2)
  })

  it('ignores duplicate ids in the request', async () => {
    await put(taskId, [member.id, member.id, member.id])
    expect(await prisma.taskAssignee.count({ where: { taskId } })).toBe(1)
  })

  it('a non-member cannot change assignees at all (SC5)', async () => {
    signedInAs((await createSession(stranger.id)).token)
    const res = await put(taskId, [stranger.id])
    expect(res.status).toBe(404)
    expect(await assignedIds()).toEqual([])
  })
})
