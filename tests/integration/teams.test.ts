import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { PATCH as patchTeam, DELETE as deleteTeam } from '@/app/api/teams/[teamId]/route'
import { POST as addMember } from '@/app/api/teams/[teamId]/members/route'
import { DELETE as removeMember, PATCH as patchMember } from '@/app/api/teams/[teamId]/members/[userId]/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/x', {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

let owner: Awaited<ReturnType<typeof makeUser>>
let member: Awaited<ReturnType<typeof makeUser>>
let outsider: Awaited<ReturnType<typeof makeUser>>
let ownerToken: string, memberToken: string, outsiderToken: string
let teamId: string

beforeEach(async () => {
  owner = await makeUser()
  member = await makeUser()
  outsider = await makeUser()
  ownerToken = (await createSession(owner.id)).token
  memberToken = (await createSession(member.id)).token
  outsiderToken = (await createSession(outsider.id)).token
  const team = await makeTeam(owner.id, 'The Team')
  teamId = team.id
  await prisma.membership.create({ data: { userId: member.id, teamId, role: 'MEMBER' } })
  signedInAs(ownerToken)
})

const ctx = (id = teamId) => ({ params: Promise.resolve({ teamId: id }) })
const memberCtx = (userId: string) => ({ params: Promise.resolve({ teamId, userId }) })

describe('T12 — adding a member by email (SC7)', () => {
  it('adds an existing account and returns 200', async () => {
    const newcomer = await makeUser()
    const res = await addMember(req('POST', { email: newcomer.email }), ctx())
    expect(res.status).toBe(200)
    expect(await prisma.membership.count({ where: { teamId, userId: newcomer.id } })).toBe(1)
  })

  it('is case-insensitive, because email is citext', async () => {
    const newcomer = await makeUser({ email: `Mixed-${Date.now()}@Example.test` })
    const res = await addMember(req('POST', { email: newcomer.email.toUpperCase() }), ctx())
    expect(res.status).toBe(200)
  })

  it('returns an EXPLICIT no-account result for a miss — never a silent success (SC7)', async () => {
    const before = await prisma.membership.count({ where: { teamId } })
    const res = await addMember(req('POST', { email: `nobody-${Date.now()}@example.test` }), ctx())

    expect(res.status).toBe(404)
    const body = await res.json()
    // The body must DISTINGUISH this from success, and from a generic not-found.
    expect(body.error.code).toBe('NO_SUCH_ACCOUNT')
    expect(await prisma.membership.count({ where: { teamId } })).toBe(before)
  })

  it('is idempotent: re-adding an existing member does not duplicate or error', async () => {
    const res = await addMember(req('POST', { email: member.email }), ctx())
    expect(res.status).toBe(200)
    expect(await prisma.membership.count({ where: { teamId, userId: member.id } })).toBe(1)
  })

  it('a plain MEMBER cannot add anyone', async () => {
    signedInAs(memberToken)
    const newcomer = await makeUser()
    expect((await addMember(req('POST', { email: newcomer.email }), ctx())).status).toBe(404)
    expect(await prisma.membership.count({ where: { teamId, userId: newcomer.id } })).toBe(0)
  })
})

describe('T12 — the team always keeps an owner (I6)', () => {
  it('refuses to remove the last owner', async () => {
    const res = await removeMember(req('DELETE'), memberCtx(owner.id))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('LAST_OWNER')
    expect(await prisma.membership.count({ where: { teamId, userId: owner.id } })).toBe(1)
  })

  it('refuses to demote the last owner', async () => {
    const res = await patchMember(req('PATCH', { role: 'MEMBER' }), memberCtx(owner.id))
    expect(res.status).toBe(409)
    expect((await prisma.membership.findUniqueOrThrow({
      where: { userId_teamId: { userId: owner.id, teamId } } })).role).toBe('OWNER')
  })

  it('ALLOWS removing an owner once a second owner exists', async () => {
    await patchMember(req('PATCH', { role: 'OWNER' }), memberCtx(member.id))
    const res = await removeMember(req('DELETE'), memberCtx(owner.id))
    expect(res.status).toBe(200)
    expect(await prisma.membership.count({ where: { teamId, role: 'OWNER' } })).toBe(1)
  })

  it('a team can never reach zero owners through any allowed path', async () => {
    await removeMember(req('DELETE'), memberCtx(member.id))
    await removeMember(req('DELETE'), memberCtx(owner.id))
    expect(await prisma.membership.count({ where: { teamId, role: 'OWNER' } })).toBeGreaterThanOrEqual(1)
  })
})

describe('T12 — removing a member clears their assignments (I4 / SC9)', () => {
  it('deletes their assignment rows for that team, and KEEPS the tasks', async () => {
    const board = await makeBoard(teamId)
    const task = await prisma.task.create({
      data: { columnId: board.columns[0].id, title: 'Assigned work', position: 0,
              assignees: { create: { userId: member.id } } },
    })
    expect(await prisma.taskAssignee.count({ where: { taskId: task.id } })).toBe(1)

    expect((await removeMember(req('DELETE'), memberCtx(member.id))).status).toBe(200)

    // I4: no assignment may outlive the membership, even for an instant.
    expect(await prisma.taskAssignee.count({ where: { userId: member.id, taskId: task.id } })).toBe(0)
    // SC9: losing a person must not lose the work.
    expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull()
  })

  it('leaves their assignments in OTHER teams untouched', async () => {
    const otherOwner = await makeUser()
    const otherTeam = await makeTeam(otherOwner.id, 'Other')
    await prisma.membership.create({ data: { userId: member.id, teamId: otherTeam.id, role: 'MEMBER' } })
    const otherBoard = await makeBoard(otherTeam.id)
    const otherTask = await prisma.task.create({
      data: { columnId: otherBoard.columns[0].id, title: 'Elsewhere', position: 0,
              assignees: { create: { userId: member.id } } },
    })

    await removeMember(req('DELETE'), memberCtx(member.id))

    // The cleanup is scoped to the team they left, not to the person globally.
    expect(await prisma.taskAssignee.count({ where: { userId: member.id, taskId: otherTask.id } })).toBe(1)
  })
})

describe('T12 — owner-only actions (SC6)', () => {
  it('owner renames; member cannot', async () => {
    expect((await patchTeam(req('PATCH', { name: 'Renamed' }), ctx())).status).toBe(200)
    signedInAs(memberToken)
    expect((await patchTeam(req('PATCH', { name: 'Hijacked' }), ctx())).status).toBe(404)
    expect((await prisma.team.findUniqueOrThrow({ where: { id: teamId } })).name).toBe('Renamed')
  })

  it('owner deletes the team and its boards cascade; member cannot delete', async () => {
    await makeBoard(teamId)
    signedInAs(memberToken)
    expect((await deleteTeam(req('DELETE'), ctx())).status).toBe(404)
    expect(await prisma.team.count({ where: { id: teamId } })).toBe(1)

    signedInAs(ownerToken)
    expect((await deleteTeam(req('DELETE'), ctx())).status).toBe(200)
    expect(await prisma.team.count({ where: { id: teamId } })).toBe(0)
    expect(await prisma.board.count({ where: { teamId } })).toBe(0)
  })

  it('an outsider sees the shared 404 on every team route', async () => {
    signedInAs(outsiderToken)
    for (const res of [
      await patchTeam(req('PATCH', { name: 'x' }), ctx()),
      await deleteTeam(req('DELETE'), ctx()),
      await addMember(req('POST', { email: outsider.email }), ctx()),
      await removeMember(req('DELETE'), memberCtx(member.id)),
    ]) expect(res.status).toBe(404)
  })
})
