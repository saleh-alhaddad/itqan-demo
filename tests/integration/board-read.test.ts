import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { GET as getBoard } from '@/app/api/boards/[boardId]/route'
import { makeUser, makeTeam, makeBoard } from '../factories'
import { createSession } from '@/lib/auth/session'

afterAll(async () => { await prisma.$disconnect() })

const ABSENT = '00000000-0000-4000-8000-000000000000'
// A value that cannot occur anywhere else in the payload. An earlier version asserted the
// absence of the literal 'one', which the default column name "Done" contains — the test
// failed on correct code. Substring assertions need a string nothing else can produce.
const COMMENT_SENTINEL = 'zzcommentbodyzz'
const call = (boardId: string) =>
  getBoard(new Request(`http://localhost/api/boards/${boardId}`), { params: Promise.resolve({ boardId }) })

let owner: Awaited<ReturnType<typeof makeUser>>
let outsider: Awaited<ReturnType<typeof makeUser>>
let ownerToken: string
let outsiderToken: string
let boardId: string
let firstColumnId: string

beforeAll(async () => {
  owner = await makeUser()
  outsider = await makeUser()
  ownerToken = (await createSession(owner.id)).token
  outsiderToken = (await createSession(outsider.id)).token

  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id, 'Read Board')
  boardId = board.id
  firstColumnId = board.columns[0].id

  // Two tasks out of natural insertion order, so "ordered by position" is a real assertion.
  const second = await prisma.task.create({
    data: { columnId: firstColumnId, title: 'Second', position: 1 },
  })
  await prisma.task.create({ data: { columnId: firstColumnId, title: 'First', position: 0 } })
  await prisma.taskAssignee.create({ data: { taskId: second.id, userId: owner.id } })
  await prisma.comment.createMany({
    data: [
      { taskId: second.id, authorId: owner.id, body: COMMENT_SENTINEL },
      { taskId: second.id, authorId: owner.id, body: `${COMMENT_SENTINEL}-2` },
    ],
  })
})

describe('T07 — GET /api/boards/:id', () => {
  it('returns the board with columns, tasks, assignees and comment COUNTS', async () => {
    signedInAs(ownerToken)
    const res = await call(boardId)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.name).toBe('Read Board')
    expect(body.columns).toHaveLength(3)

    const col = body.columns[0]
    expect(col.tasks).toHaveLength(2)
    const second = col.tasks.find((t: { title: string }) => t.title === 'Second')
    expect(second.assignees[0].id).toBe(owner.id)
    expect(second.commentCount).toBe(2)
  })

  it('never ships comment BODIES — the poll re-fetches this every 10s (SC10 payload)', async () => {
    signedInAs(ownerToken)
    const text = await (await call(boardId)).text()
    expect(text).not.toContain('"body"')
    expect(text).not.toContain(COMMENT_SENTINEL)
  })

  it('does NOT ship member email addresses — the board renders initials, not emails', async () => {
    // Found in verify: the polled payload carried every assignee's and every team member's
    // email while no board component reads one. Two costs: 13% of a 151KB response that is
    // re-fetched every ten seconds, and each member's address exposed to every board viewer
    // for no functional reason. Team settings fetches emails through its own query.
    signedInAs(ownerToken)
    const text = await (await call(boardId)).text()
    expect(text).not.toContain(owner.email)
    expect(text).not.toContain('@example.test')
    expect(text).not.toContain('"email"')
  })

  it('never leaks a password hash through the assignee records', async () => {
    signedInAs(ownerToken)
    const text = await (await call(boardId)).text()
    expect(text).not.toContain('passwordHash')
    expect(text).not.toContain('argon2')
  })

  it('orders columns and tasks by position, not by insertion', async () => {
    signedInAs(ownerToken)
    const body = await (await call(boardId)).json()
    expect(body.columns.map((c: { position: number }) => c.position)).toEqual([0, 1, 2])
    expect(body.columns[0].tasks.map((t: { title: string }) => t.title)).toEqual(['First', 'Second'])
  })

  it('gives a NON-MEMBER and an ABSENT board byte-identical 404s (SC5)', async () => {
    signedInAs(outsiderToken)
    const [inaccessible, absent] = await Promise.all([call(boardId), call(ABSENT)])
    expect(inaccessible.status).toBe(404)
    expect(absent.status).toBe(404)
    expect(await inaccessible.text()).toBe(await absent.text())
  })

  it('rejects an unauthenticated request', async () => {
    signedInAs(null)
    expect((await call(boardId)).status).toBe(401)
  })
})
