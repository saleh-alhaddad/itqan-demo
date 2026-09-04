import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { provisionNewAccount, DEFAULT_COLUMN_NAMES } from '@/lib/provisioning'

afterAll(async () => { await prisma.$disconnect() })

const creds = (n = '') => ({
  email: `signup-${Date.now()}-${Math.random().toString(36).slice(2)}${n}@example.test`,
  password: 'a-perfectly-fine-password',
  name: 'New Person',
})

describe('T04 — first-run provisioning (SC1)', () => {
  it('creates user, team, OWNER membership, board and the default columns together', async () => {
    const c = creds()
    const { user, board } = await provisionNewAccount(c)

    const loaded = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { memberships: { include: { team: { include: { boards: { include: { columns: true } } } } } } },
    })

    expect(loaded.memberships).toHaveLength(1)
    expect(loaded.memberships[0].role).toBe('OWNER')

    const team = loaded.memberships[0].team
    expect(team.boards).toHaveLength(1)
    expect(team.boards[0].id).toBe(board.id)

    // SC1: the user lands on a board that already has columns — never an empty state.
    const names = team.boards[0].columns.sort((a, b) => a.position - b.position).map((x) => x.name)
    expect(names).toEqual([...DEFAULT_COLUMN_NAMES])
  })

  it('positions the default columns densely from 0 (I5)', async () => {
    const { board } = await provisionNewAccount(creds())
    const cols = await prisma.column.findMany({ where: { boardId: board.id }, orderBy: { position: 'asc' } })
    expect(cols.map((c) => c.position)).toEqual([0, 1, 2])
  })

  it('never stores the password in plaintext (SC11)', async () => {
    const c = creds()
    const { user } = await provisionNewAccount(c)
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row.passwordHash).toMatch(/^\$argon2id\$/)
    expect(row.passwordHash).not.toContain(c.password)
  })

  it('treats email as case-insensitive: a second signup differing only in case is rejected', async () => {
    const c = creds()
    await provisionNewAccount(c)
    await expect(provisionNewAccount({ ...c, email: c.email.toUpperCase() })).rejects.toThrow()
  })
})

describe('T04 — provisioning is atomic (SC2)', () => {
  it('leaves ZERO user rows when a step after the user insert fails', async () => {
    const c = creds()

    // Fail at column creation — genuinely partway through, after User/Team/Membership/Board.
    // Injected through a Prisma client extension rather than a test-only hook in the
    // production code, so what runs here is the real provisioning path.
    const failing = prisma.$extends({
      query: {
        column: {
          createMany() {
            throw new Error('forced failure at column creation')
          },
        },
      },
    })

    await expect(
      provisionNewAccount(c, failing as unknown as typeof prisma),
    ).rejects.toThrow(/forced failure/)

    // SC2: no partial account survives.
    expect(await prisma.user.findFirst({ where: { email: c.email } })).toBeNull()
    expect(await prisma.team.count({ where: { memberships: { some: { user: { email: c.email } } } } })).toBe(0)
  })
})
