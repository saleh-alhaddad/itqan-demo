import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const ABSENT = '00000000-0000-4000-8000-000000000000'

type Row = {
  name: string
  /** The route file this row covers, so the completeness check can match them up. */
  file: string
  call: (ids: Ids) => Promise<Response>
  /** With an absent id, to compare the two responses byte for byte. */
  absent: (ids: Ids) => Promise<Response>
}
type Ids = { teamId: string; boardId: string; columnId: string; taskId: string; commentId: string }

const json = (method: string, body?: unknown) =>
  new Request('http://localhost/x', {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

let ids: Ids
let outsiderToken: string
let rowsUnderTest: Row[]

beforeAll(async () => {
  const owner = await makeUser()
  const outsider = await makeUser()
  outsiderToken = (await createSession(outsider.id)).token

  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id)
  const column = board.columns[0]
  const task = await prisma.task.create({ data: { columnId: column.id, title: 'Private', position: 0 } })
  const comment = await prisma.comment.create({ data: { taskId: task.id, authorId: owner.id, body: 'private' } })
  ids = { teamId: team.id, boardId: board.id, columnId: column.id, taskId: task.id, commentId: comment.id }

  const boards = await import('@/app/api/boards/[boardId]/route')
  const boardColumns = await import('@/app/api/boards/[boardId]/columns/route')
  const columns = await import('@/app/api/columns/[columnId]/route')
  const columnTasks = await import('@/app/api/columns/[columnId]/tasks/route')
  const tasks = await import('@/app/api/tasks/[taskId]/route')
  const assignees = await import('@/app/api/tasks/[taskId]/assignees/route')
  const taskComments = await import('@/app/api/tasks/[taskId]/comments/route')
  const comments = await import('@/app/api/comments/[commentId]/route')
  const teams = await import('@/app/api/teams/[teamId]/route')
  const teamBoards = await import('@/app/api/teams/[teamId]/boards/route')
  const members = await import('@/app/api/teams/[teamId]/members/route')
  const member = await import('@/app/api/teams/[teamId]/members/[userId]/route')

  const P = <T,>(v: T) => Promise.resolve(v)

  rowsUnderTest = [
    { name: 'GET board', file: 'boards/[boardId]/route.ts',
      call: (i) => boards.GET(json('GET'), { params: P({ boardId: i.boardId }) }),
      absent: () => boards.GET(json('GET'), { params: P({ boardId: ABSENT }) }) },
    { name: 'PATCH board', file: 'boards/[boardId]/route.ts',
      call: (i) => boards.PATCH(json('PATCH', { name: 'x' }), { params: P({ boardId: i.boardId }) }),
      absent: () => boards.PATCH(json('PATCH', { name: 'x' }), { params: P({ boardId: ABSENT }) }) },
    { name: 'DELETE board', file: 'boards/[boardId]/route.ts',
      call: (i) => boards.DELETE(json('DELETE'), { params: P({ boardId: i.boardId }) }),
      absent: () => boards.DELETE(json('DELETE'), { params: P({ boardId: ABSENT }) }) },
    { name: 'POST column', file: 'boards/[boardId]/columns/route.ts',
      call: (i) => boardColumns.POST(json('POST', { name: 'x' }), { params: P({ boardId: i.boardId }) }),
      absent: () => boardColumns.POST(json('POST', { name: 'x' }), { params: P({ boardId: ABSENT }) }) },
    { name: 'PATCH column', file: 'columns/[columnId]/route.ts',
      call: (i) => columns.PATCH(json('PATCH', { name: 'x' }), { params: P({ columnId: i.columnId }) }),
      absent: () => columns.PATCH(json('PATCH', { name: 'x' }), { params: P({ columnId: ABSENT }) }) },
    { name: 'DELETE column', file: 'columns/[columnId]/route.ts',
      call: (i) => columns.DELETE(json('DELETE'), { params: P({ columnId: i.columnId }) }),
      absent: () => columns.DELETE(json('DELETE'), { params: P({ columnId: ABSENT }) }) },
    { name: 'POST task', file: 'columns/[columnId]/tasks/route.ts',
      call: (i) => columnTasks.POST(json('POST', { title: 'x' }), { params: P({ columnId: i.columnId }) }),
      absent: () => columnTasks.POST(json('POST', { title: 'x' }), { params: P({ columnId: ABSENT }) }) },
    { name: 'PATCH task (move)', file: 'tasks/[taskId]/route.ts',
      call: (i) => tasks.PATCH(json('PATCH', { title: 'x' }), { params: P({ taskId: i.taskId }) }),
      absent: () => tasks.PATCH(json('PATCH', { title: 'x' }), { params: P({ taskId: ABSENT }) }) },
    { name: 'DELETE task', file: 'tasks/[taskId]/route.ts',
      call: (i) => tasks.DELETE(json('DELETE'), { params: P({ taskId: i.taskId }) }),
      absent: () => tasks.DELETE(json('DELETE'), { params: P({ taskId: ABSENT }) }) },
    { name: 'PUT assignees', file: 'tasks/[taskId]/assignees/route.ts',
      call: (i) => assignees.PUT(json('PUT', { userIds: [] }), { params: P({ taskId: i.taskId }) }),
      absent: () => assignees.PUT(json('PUT', { userIds: [] }), { params: P({ taskId: ABSENT }) }) },
    { name: 'GET comments', file: 'tasks/[taskId]/comments/route.ts',
      call: (i) => taskComments.GET(json('GET'), { params: P({ taskId: i.taskId }) }),
      absent: () => taskComments.GET(json('GET'), { params: P({ taskId: ABSENT }) }) },
    { name: 'POST comment', file: 'tasks/[taskId]/comments/route.ts',
      call: (i) => taskComments.POST(json('POST', { body: 'x' }), { params: P({ taskId: i.taskId }) }),
      absent: () => taskComments.POST(json('POST', { body: 'x' }), { params: P({ taskId: ABSENT }) }) },
    { name: 'DELETE comment', file: 'comments/[commentId]/route.ts',
      call: (i) => comments.DELETE(json('DELETE'), { params: P({ commentId: i.commentId }) }),
      absent: () => comments.DELETE(json('DELETE'), { params: P({ commentId: ABSENT }) }) },
    { name: 'PATCH team', file: 'teams/[teamId]/route.ts',
      call: (i) => teams.PATCH(json('PATCH', { name: 'x' }), { params: P({ teamId: i.teamId }) }),
      absent: () => teams.PATCH(json('PATCH', { name: 'x' }), { params: P({ teamId: ABSENT }) }) },
    { name: 'DELETE team', file: 'teams/[teamId]/route.ts',
      call: (i) => teams.DELETE(json('DELETE'), { params: P({ teamId: i.teamId }) }),
      absent: () => teams.DELETE(json('DELETE'), { params: P({ teamId: ABSENT }) }) },
    { name: 'POST board in team', file: 'teams/[teamId]/boards/route.ts',
      call: (i) => teamBoards.POST(json('POST', { name: 'x' }), { params: P({ teamId: i.teamId }) }),
      absent: () => teamBoards.POST(json('POST', { name: 'x' }), { params: P({ teamId: ABSENT }) }) },
    { name: 'POST member', file: 'teams/[teamId]/members/route.ts',
      call: (i) => members.POST(json('POST', { email: 'a@b.test' }), { params: P({ teamId: i.teamId }) }),
      absent: () => members.POST(json('POST', { email: 'a@b.test' }), { params: P({ teamId: ABSENT }) }) },
    { name: 'DELETE member', file: 'teams/[teamId]/members/[userId]/route.ts',
      call: (i) => member.DELETE(json('DELETE'), { params: P({ teamId: i.teamId, userId: ABSENT }) }),
      absent: () => member.DELETE(json('DELETE'), { params: P({ teamId: ABSENT, userId: ABSENT }) }) },
    { name: 'PATCH member', file: 'teams/[teamId]/members/[userId]/route.ts',
      call: (i) => member.PATCH(json('PATCH', { role: 'MEMBER' }), { params: P({ teamId: i.teamId, userId: ABSENT }) }),
      absent: () => member.PATCH(json('PATCH', { role: 'MEMBER' }), { params: P({ teamId: ABSENT, userId: ABSENT }) }) },
  ]
})

describe('T18 — SC5: every team-scoped endpoint, as a signed-in NON-MEMBER', () => {
  it('refuses all of them with 404 and a body identical to an absent resource', async () => {
    signedInAs(outsiderToken)

    for (const row of rowsUnderTest) {
      const [inaccessible, absent] = await Promise.all([row.call(ids), row.absent(ids)])

      expect(inaccessible.status, `${row.name}: status`).toBe(404)
      expect(absent.status, `${row.name}: absent status`).toBe(404)
      // Byte-identical. Anything that differed would say whether the resource exists.
      expect(await inaccessible.text(), `${row.name}: body`).toBe(await absent.text())
    }
  })

  it('and mutates NOTHING while doing so', async () => {
    signedInAs(outsiderToken)
    const before = {
      teams: await prisma.team.count(), boards: await prisma.board.count(),
      columns: await prisma.column.count(), tasks: await prisma.task.count(),
      comments: await prisma.comment.count(), members: await prisma.membership.count(),
      assignees: await prisma.taskAssignee.count(),
    }

    for (const row of rowsUnderTest) await row.call(ids)

    expect({
      teams: await prisma.team.count(), boards: await prisma.board.count(),
      columns: await prisma.column.count(), tasks: await prisma.task.count(),
      comments: await prisma.comment.count(), members: await prisma.membership.count(),
      assignees: await prisma.taskAssignee.count(),
    }).toEqual(before)
  })
})

describe('T18 — the matrix stays complete as endpoints are added', () => {
  it('every route file under src/app/api is covered by a row (or explicitly exempt)', () => {
    const apiRoot = join(process.cwd(), 'src', 'app', 'api')
    const routeFiles: string[] = []
    const walk = (dir: string, prefix = '') => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`)
        else if (entry === 'route.ts') routeFiles.push(`${prefix}${entry}`)
      }
    }
    walk(apiRoot)

    /**
     * Endpoints that are NOT team-scoped, and why. Anything not here and not in the matrix
     * fails this test — which is the point: without it, SC5 silently stops covering
     * endpoints added later, and a passing suite tests less than it did yesterday.
     */
    const exempt = new Set([
      'auth/signup/route.ts',   // unauthenticated by definition
      'auth/login/route.ts',    // unauthenticated by definition
      'auth/logout/route.ts',   // unauthenticated; clears whatever cookie is presented
      'health/route.ts',        // liveness probe; returns no application data
    ])

    const covered = new Set(rowsUnderTest.map((r) => r.file))
    const uncovered = routeFiles.filter((f) => !covered.has(f) && !exempt.has(f))

    expect(uncovered, `route files with no SC5 matrix row:\n  ${uncovered.join('\n  ')}`).toEqual([])
  })
})
