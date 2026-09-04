import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { requireBoardAccess, requireTeamMember, requireTeamOwner, requireTaskAccess } from '@/lib/auth/guard'
import { notFound, ApiError, handleErrors } from '@/lib/api/errors'
import { makeUser, makeTeam, makeBoard, makeFullTree } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const ABSENT = '00000000-0000-4000-8000-000000000000'

describe('T06 — requireBoardAccess (I2)', () => {
  it('returns the board for a member', async () => {
    const { owner, board } = await makeFullTree()
    const got = await requireBoardAccess(owner.id, board.id)
    expect(got.id).toBe(board.id)
  })

  it('gives a NON-MEMBER and an ABSENT board the same failure (SC5)', async () => {
    const { board } = await makeFullTree()
    const outsider = await makeUser()

    const a = await requireBoardAccess(outsider.id, board.id).catch((e) => e)
    const b = await requireBoardAccess(outsider.id, ABSENT).catch((e) => e)

    expect(a).toBeInstanceOf(ApiError)
    expect(b).toBeInstanceOf(ApiError)
    expect(a.code).toBe(b.code)
    expect(a.status).toBe(b.status)
    expect(a.message).toBe(b.message)
  })

  it('produces BYTE-IDENTICAL responses for both cases (SC5)', async () => {
    const { board } = await makeFullTree()
    const outsider = await makeUser()

    const respond = (id: string) =>
      handleErrors(async () => {
        await requireBoardAccess(outsider.id, id)
        return new Response('unreachable')
      })

    const [inaccessible, absent] = await Promise.all([respond(board.id), respond(ABSENT)])

    expect(inaccessible.status).toBe(absent.status)
    expect(inaccessible.status).toBe(404)
    expect(await inaccessible.text()).toBe(await absent.text())
    expect(inaccessible.headers.get('content-type')).toBe(absent.headers.get('content-type'))
  })

  it('the shared notFound() reveals nothing about what was asked for', async () => {
    const body = await notFound().json()
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })
  })
})

describe('T06 — requireTaskAccess walks the ownership chain', () => {
  it('resolves a task for a member of the owning team', async () => {
    const { owner, task } = await makeFullTree()
    const got = await requireTaskAccess(owner.id, task.id)
    expect(got.id).toBe(task.id)
  })

  it('refuses a task in another team, identically to an absent task', async () => {
    const { task } = await makeFullTree()
    const outsider = await makeUser()
    const a = await requireTaskAccess(outsider.id, task.id).catch((e) => e)
    const b = await requireTaskAccess(outsider.id, ABSENT).catch((e) => e)
    expect(a.code).toBe('NOT_FOUND')
    expect(b.code).toBe('NOT_FOUND')
  })

  it('reaches the team only through Column -> Board, with no teamId on Task', async () => {
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='Task'`,
    )
    // A denormalised teamId would create a second ownership path — the thing I1 forbids.
    expect(cols.map((c) => c.column_name)).not.toContain('teamId')
  })
})

describe('T06 — team membership and ownership', () => {
  it('requireTeamMember admits a member and refuses an outsider', async () => {
    const { owner, team } = await makeFullTree()
    const outsider = await makeUser()
    await expect(requireTeamMember(owner.id, team.id)).resolves.toBeDefined()
    await expect(requireTeamMember(outsider.id, team.id)).rejects.toThrow(ApiError)
  })

  it('requireTeamOwner admits the owner and refuses a plain member', async () => {
    const ownerUser = await makeUser()
    const team = await makeTeam(ownerUser.id)
    const member = await makeUser()
    await prisma.membership.create({ data: { userId: member.id, teamId: team.id, role: 'MEMBER' } })

    await expect(requireTeamOwner(ownerUser.id, team.id)).resolves.toBeDefined()
    await expect(requireTeamOwner(member.id, team.id)).rejects.toThrow(ApiError)
  })

  it('refuses a MEMBER with the same 404 an outsider gets, not a 403', async () => {
    // A 403 would confirm the team exists and that they simply lack the role. For a
    // team-scoped resource that is still more than a non-member should learn.
    const ownerUser = await makeUser()
    const team = await makeTeam(ownerUser.id)
    const member = await makeUser()
    await prisma.membership.create({ data: { userId: member.id, teamId: team.id, role: 'MEMBER' } })

    const err = await requireTeamOwner(member.id, team.id).catch((e) => e)
    expect(err.status).toBe(404)
  })

  it('a board in a team you do not belong to is invisible even if you know its id', async () => {
    const stranger = await makeUser()
    const victimOwner = await makeUser()
    const victimTeam = await makeTeam(victimOwner.id)
    const victimBoard = await makeBoard(victimTeam.id)
    await expect(requireBoardAccess(stranger.id, victimBoard.id)).rejects.toThrow(ApiError)
  })
})
