import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { GET as listComments, POST as postComment } from '@/app/api/tasks/[taskId]/comments/route'
import { DELETE as deleteComment } from '@/app/api/comments/[commentId]/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/x', {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const taskCtx = () => ({ params: Promise.resolve({ taskId }) })
const commentCtx = (commentId: string) => ({ params: Promise.resolve({ commentId }) })

let owner: Awaited<ReturnType<typeof makeUser>>
let author: Awaited<ReturnType<typeof makeUser>>
let other: Awaited<ReturnType<typeof makeUser>>
let stranger: Awaited<ReturnType<typeof makeUser>>
let ownerToken: string, authorToken: string, otherToken: string, strangerToken: string
let taskId: string

beforeEach(async () => {
  owner = await makeUser(); author = await makeUser(); other = await makeUser(); stranger = await makeUser()
  ownerToken = (await createSession(owner.id)).token
  authorToken = (await createSession(author.id)).token
  otherToken = (await createSession(other.id)).token
  strangerToken = (await createSession(stranger.id)).token

  const team = await makeTeam(owner.id)
  for (const u of [author, other]) {
    await prisma.membership.create({ data: { userId: u.id, teamId: team.id, role: 'MEMBER' } })
  }
  const board = await makeBoard(team.id)
  taskId = (await prisma.task.create({ data: { columnId: board.columns[0].id, title: 'Discussed', position: 0 } })).id
})

async function comment(as: string, body = 'A comment') {
  signedInAs(as)
  const res = await postComment(req('POST', { body }), taskCtx())
  return { res, id: res.status === 201 ? (await res.json()).id as string : '' }
}

describe('T14 — posting and reading comments', () => {
  it('any member of the board’s team can comment', async () => {
    for (const token of [ownerToken, authorToken, otherToken]) {
      expect((await comment(token)).res.status).toBe(201)
    }
    expect(await prisma.comment.count({ where: { taskId } })).toBe(3)
  })

  it('rejects an empty or whitespace-only body', async () => {
    for (const body of ['', '   ', '\n\t']) {
      const { res } = await comment(authorToken, body)
      expect(res.status).toBe(400)
    }
    expect(await prisma.comment.count({ where: { taskId } })).toBe(0)
  })

  it('returns comments oldest-first with their authors', async () => {
    await comment(authorToken, 'first')
    await comment(otherToken, 'second')
    signedInAs(ownerToken)
    const body = await (await listComments(req('GET'), taskCtx())).json()
    expect(body.comments.map((c: { body: string }) => c.body)).toEqual(['first', 'second'])
    expect(body.comments[0].author.name).toBe(author.name)
    expect(body.total).toBe(2)
    expect(body.olderHidden).toBe(0)
    // A comment payload must never carry the author's credentials.
    expect(JSON.stringify(body)).not.toContain('passwordHash')
  })

  it('H2: the list is BOUNDED — a busy card returns a page, not everything', async () => {
    // Found unbounded in review: a task with thousands of comments returned all of them,
    // undoing the reason the board ships counts rather than bodies.
    const rows = Array.from({ length: 130 }, (_, i) => ({
      taskId, authorId: author.id, body: `bulk-${String(i).padStart(3, '0')}`,
      createdAt: new Date(Date.now() + i * 1000),
    }))
    await prisma.comment.createMany({ data: rows })

    signedInAs(ownerToken)
    const body = await (await listComments(req('GET'), taskCtx())).json()

    expect(body.comments.length).toBe(100)
    expect(body.total).toBe(130)
    expect(body.olderHidden).toBe(30)
    // It keeps the NEWEST page, presented oldest-first for reading.
    expect(body.comments[0].body).toBe('bulk-030')
    expect(body.comments[99].body).toBe('bulk-129')
  })

  it('stores the body verbatim — no markdown, no HTML interpretation', async () => {
    const payload = '<script>alert(1)</script> **not bold** <b>x</b>'
    const { id } = await comment(authorToken, payload)
    expect((await prisma.comment.findUniqueOrThrow({ where: { id } })).body).toBe(payload)
  })

  it('a non-member can neither read nor post (SC5)', async () => {
    signedInAs(strangerToken)
    expect((await listComments(req('GET'), taskCtx())).status).toBe(404)
    expect((await postComment(req('POST', { body: 'sneaky' }), taskCtx())).status).toBe(404)
    expect(await prisma.comment.count({ where: { taskId } })).toBe(0)
  })
})

describe('T14 — deletion: author OR team owner, nobody else (SC6)', () => {
  it('the AUTHOR can delete their own', async () => {
    const { id } = await comment(authorToken)
    signedInAs(authorToken)
    expect((await deleteComment(req('DELETE'), commentCtx(id))).status).toBe(200)
    expect(await prisma.comment.findUnique({ where: { id } })).toBeNull()
  })

  it('the TEAM OWNER can delete anyone’s', async () => {
    const { id } = await comment(authorToken)
    signedInAs(ownerToken)
    expect((await deleteComment(req('DELETE'), commentCtx(id))).status).toBe(200)
    expect(await prisma.comment.findUnique({ where: { id } })).toBeNull()
  })

  it('a non-author, non-owner MEMBER cannot — the deny half of the pair', async () => {
    const { id } = await comment(authorToken)
    signedInAs(otherToken)
    const res = await deleteComment(req('DELETE'), commentCtx(id))
    expect(res.status).toBe(403)
    expect(await prisma.comment.findUnique({ where: { id } })).not.toBeNull()
  })

  it('a non-member gets the shared 404, not a 403 — absence and inaccessibility look alike', async () => {
    const { id } = await comment(authorToken)
    signedInAs(strangerToken)
    expect((await deleteComment(req('DELETE'), commentCtx(id))).status).toBe(404)
    expect(await prisma.comment.findUnique({ where: { id } })).not.toBeNull()
  })
})
