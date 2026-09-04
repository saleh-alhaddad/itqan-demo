import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { POST as createBoard } from '@/app/api/teams/[teamId]/boards/route'
import { PATCH as patchBoard, DELETE as deleteBoard } from '@/app/api/boards/[boardId]/route'
import { createSession } from '@/lib/auth/session'
import { DEFAULT_COLUMN_NAMES } from '@/lib/provisioning'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/x', {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

let owner: Awaited<ReturnType<typeof makeUser>>
let member: Awaited<ReturnType<typeof makeUser>>
let ownerToken: string, memberToken: string, strangerToken: string
let teamId: string, boardId: string

beforeEach(async () => {
  owner = await makeUser(); member = await makeUser()
  const stranger = await makeUser()
  ownerToken = (await createSession(owner.id)).token
  memberToken = (await createSession(member.id)).token
  strangerToken = (await createSession(stranger.id)).token

  const team = await makeTeam(owner.id)
  teamId = team.id
  await prisma.membership.create({ data: { userId: member.id, teamId, role: 'MEMBER' } })
  boardId = (await makeBoard(teamId, 'Existing')).id
  signedInAs(ownerToken)
})

const teamCtx = () => ({ params: Promise.resolve({ teamId }) })
const boardCtx = (id = boardId) => ({ params: Promise.resolve({ boardId: id }) })

describe('T15 — creating a board', () => {
  it('ANY member can create one, and it arrives with the default columns', async () => {
    signedInAs(memberToken)
    const res = await createBoard(req('POST', { name: 'Fresh' }), teamCtx())
    expect(res.status).toBe(201)

    const created = await res.json()
    const columns = await prisma.column.findMany({
      where: { boardId: created.id }, orderBy: { position: 'asc' },
    })
    // Identical to what signup produces — the same helper, so the two cannot drift.
    expect(columns.map((c) => c.name)).toEqual([...DEFAULT_COLUMN_NAMES])
    expect(columns.map((c) => c.position)).toEqual([0, 1, 2])
  })

  it('rejects an empty name', async () => {
    const res = await createBoard(req('POST', { name: '  ' }), teamCtx())
    expect(res.status).toBe(400)
  })

  it('a non-member cannot create a board in someone else’s team', async () => {
    signedInAs(strangerToken)
    expect((await createBoard(req('POST', { name: 'Sneaky' }), teamCtx())).status).toBe(404)
    expect(await prisma.board.count({ where: { teamId, name: 'Sneaky' } })).toBe(0)
  })
})

describe('T15 — renaming and deleting (SC6)', () => {
  it('any member can rename', async () => {
    signedInAs(memberToken)
    expect((await patchBoard(req('PATCH', { name: 'Renamed' }), boardCtx())).status).toBe(200)
    expect((await prisma.board.findUniqueOrThrow({ where: { id: boardId } })).name).toBe('Renamed')
  })

  it('ALLOW-AND-DENY: a member cannot delete a board, the team owner can (SC6)', async () => {
    signedInAs(memberToken)
    expect((await deleteBoard(req('DELETE'), boardCtx())).status).toBe(404)
    expect(await prisma.board.count({ where: { id: boardId } })).toBe(1)

    signedInAs(ownerToken)
    expect((await deleteBoard(req('DELETE'), boardCtx())).status).toBe(200)
    expect(await prisma.board.count({ where: { id: boardId } })).toBe(0)
  })

  it('deleting a board destroys its columns, tasks, assignments and comments (I7)', async () => {
    const column = await prisma.column.findFirstOrThrow({ where: { boardId } })
    const task = await prisma.task.create({
      data: { columnId: column.id, title: 'Doomed', position: 0,
              assignees: { create: { userId: owner.id } },
              comments: { create: { authorId: owner.id, body: 'bye' } } },
    })

    signedInAs(ownerToken)
    expect((await deleteBoard(req('DELETE'), boardCtx())).status).toBe(200)

    expect(await prisma.column.count({ where: { boardId } })).toBe(0)
    expect(await prisma.task.count({ where: { id: task.id } })).toBe(0)
    expect(await prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(0)
    expect(await prisma.comment.count({ where: { taskId: task.id } })).toBe(0)
  })

  it('reports what the delete will destroy, so the confirmation can say it', async () => {
    const column = await prisma.column.findFirstOrThrow({ where: { boardId } })
    await prisma.task.createMany({
      data: [
        { columnId: column.id, title: 'a', position: 0 },
        { columnId: column.id, title: 'b', position: 1 },
      ],
    })
    signedInAs(ownerToken)
    const res = await deleteBoard(req('DELETE'), boardCtx())
    expect((await res.json()).deletedTaskCount).toBe(2)
  })
})
