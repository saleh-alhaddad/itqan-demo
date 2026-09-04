import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { listBoardsFor } from '@/lib/boards'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

describe('listBoardsFor — the destination a returning user lands on', () => {
  it('returns the actor’s boards, grouped by team, with their role', async () => {
    const user = await makeUser()
    const team = await makeTeam(user.id, 'Alpha')
    await makeBoard(team.id, 'Roadmap')
    await makeBoard(team.id, 'Bugs')

    const teams = await listBoardsFor(user.id)
    const alpha = teams.find((t) => t.id === team.id)
    expect(alpha).toBeDefined()
    expect(alpha!.role).toBe('OWNER')
    expect(alpha!.boards.map((b) => b.name).sort()).toEqual(['Bugs', 'Roadmap'])
  })

  it('NEVER includes a board from a team the actor does not belong to', async () => {
    const actor = await makeUser()
    const mine = await makeTeam(actor.id, 'Mine')
    await makeBoard(mine.id, 'Visible')

    const stranger = await makeUser()
    const theirs = await makeTeam(stranger.id, 'Theirs')
    await makeBoard(theirs.id, 'Invisible')

    const teams = await listBoardsFor(actor.id)
    const names = teams.flatMap((t) => t.boards.map((b) => b.name))
    expect(names).toContain('Visible')
    expect(names).not.toContain('Invisible')
    expect(teams.map((t) => t.name)).not.toContain('Theirs')
  })

  it('spans several teams, since a user may belong to many', async () => {
    const user = await makeUser()
    const a = await makeTeam(user.id, 'Team A')
    await makeBoard(a.id, 'A board')

    const otherOwner = await makeUser()
    const b = await makeTeam(otherOwner.id, 'Team B')
    await prisma.membership.create({ data: { userId: user.id, teamId: b.id, role: 'MEMBER' } })
    await makeBoard(b.id, 'B board')

    const teams = await listBoardsFor(user.id)
    expect(teams.map((t) => t.name).sort()).toEqual(['Team A', 'Team B'])
    expect(teams.find((t) => t.name === 'Team B')!.role).toBe('MEMBER')
  })

  it('returns an empty list rather than throwing when the actor has no teams', async () => {
    const loner = await makeUser()
    await expect(listBoardsFor(loner.id)).resolves.toEqual([])
  })
})
