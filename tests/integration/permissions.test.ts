import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'
import { DELETE as deleteBoard } from '@/app/api/boards/[boardId]/route'
import { DELETE as deleteTask } from '@/app/api/tasks/[taskId]/route'
import { DELETE as deleteComment } from '@/app/api/comments/[commentId]/route'

afterAll(async () => { await prisma.$disconnect() })

const req = (m: string) => new Request('http://localhost/x', { method: m })

/**
 * SC6, as ALLOW-AND-DENY PAIRS.
 *
 * A deny-only test passes just as well against an endpoint that refuses everybody, which
 * would be a broken product with a green suite. Every rule below is therefore asserted in
 * both directions: the person who may, and the person who may not.
 */
let ownerTok: string, memberTok: string, otherTok: string
let owner: Awaited<ReturnType<typeof makeUser>>
let member: Awaited<ReturnType<typeof makeUser>>
let boardId: string, columnId: string

beforeEach(async () => {
  owner = await makeUser(); member = await makeUser()
  const other = await makeUser()
  ownerTok = (await createSession(owner.id)).token
  memberTok = (await createSession(member.id)).token
  otherTok = (await createSession(other.id)).token

  const team = await makeTeam(owner.id)
  for (const u of [member, other]) {
    await prisma.membership.create({ data: { userId: u.id, teamId: team.id, role: 'MEMBER' } })
  }
  const board = await makeBoard(team.id)
  boardId = board.id
  columnId = board.columns[0].id
})

const newTask = async () =>
  (await prisma.task.create({ data: { columnId, title: 'T', position: 0 } })).id
const newComment = async (taskId: string, authorId: string) =>
  (await prisma.comment.create({ data: { taskId, authorId, body: 'c' } })).id

describe('SC6 rule 1 — deleting a BOARD is owner-only', () => {
  it('DENY: a plain member cannot', async () => {
    signedInAs(memberTok)
    expect((await deleteBoard(req('DELETE'), { params: Promise.resolve({ boardId }) })).status).toBe(404)
    expect(await prisma.board.count({ where: { id: boardId } })).toBe(1)
  })

  it('ALLOW: the team owner can', async () => {
    signedInAs(ownerTok)
    expect((await deleteBoard(req('DELETE'), { params: Promise.resolve({ boardId }) })).status).toBe(200)
    expect(await prisma.board.count({ where: { id: boardId } })).toBe(0)
  })
})

describe('SC6 rule 2 — ANY member may delete a task', () => {
  it('ALLOW: a plain member can', async () => {
    const taskId = await newTask()
    signedInAs(memberTok)
    expect((await deleteTask(req('DELETE'), { params: Promise.resolve({ taskId }) })).status).toBe(200)
    expect(await prisma.task.count({ where: { id: taskId } })).toBe(0)
  })

  it('ALLOW: the owner can too — this rule has no owner-only half', async () => {
    const taskId = await newTask()
    signedInAs(ownerTok)
    expect((await deleteTask(req('DELETE'), { params: Promise.resolve({ taskId }) })).status).toBe(200)
  })

  it('DENY: a non-member still cannot', async () => {
    const taskId = await newTask()
    const stranger = await makeUser()
    signedInAs((await createSession(stranger.id)).token)
    expect((await deleteTask(req('DELETE'), { params: Promise.resolve({ taskId }) })).status).toBe(404)
    expect(await prisma.task.count({ where: { id: taskId } })).toBe(1)
  })
})

describe('SC6 rule 3 — a comment is deletable by its author or the team owner', () => {
  it('ALLOW: the author', async () => {
    const taskId = await newTask()
    const commentId = await newComment(taskId, member.id)
    signedInAs(memberTok)
    expect((await deleteComment(req('DELETE'), { params: Promise.resolve({ commentId }) })).status).toBe(200)
  })

  it('ALLOW: the team owner, on someone else’s comment', async () => {
    const taskId = await newTask()
    const commentId = await newComment(taskId, member.id)
    signedInAs(ownerTok)
    expect((await deleteComment(req('DELETE'), { params: Promise.resolve({ commentId }) })).status).toBe(200)
  })

  it('DENY: a member who is neither author nor owner', async () => {
    const taskId = await newTask()
    const commentId = await newComment(taskId, member.id)
    signedInAs(otherTok)
    expect((await deleteComment(req('DELETE'), { params: Promise.resolve({ commentId }) })).status).toBe(403)
    expect(await prisma.comment.count({ where: { id: commentId } })).toBe(1)
  })
})
