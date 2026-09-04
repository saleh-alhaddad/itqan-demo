import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'

/**
 * The three columns a new board starts with. Ordinary, user-editable rows — not a fixed
 * set the application treats as special, so I3 ("the column IS the status") still holds.
 */
export const DEFAULT_COLUMN_NAMES = ['To Do', 'In Progress', 'Done'] as const

type Client = typeof prisma
type TxClient = Parameters<Parameters<Client['$transaction']>[0]>[0]

/**
 * Creates a board with the default columns, densely positioned from 0 (I5).
 *
 * Extracted rather than inlined because board creation (T15) must produce exactly the
 * same starting state as signup — two copies of "the default columns" is the pair that
 * drifts, and the drift would be invisible until someone compared two boards.
 */
export async function createBoardWithDefaultColumns(tx: TxClient, teamId: string, name: string) {
  const board = await tx.board.create({ data: { teamId, name } })
  await tx.column.createMany({
    data: DEFAULT_COLUMN_NAMES.map((columnName, position) => ({ boardId: board.id, name: columnName, position })),
  })
  return board
}

/**
 * First-run provisioning (SC1, SC2).
 *
 * Everything a usable account needs — user, their team, their OWNER membership, a starter
 * board and its columns — in ONE transaction. This is the whole of SC2: there is no branch
 * that can commit partially, so a failure anywhere leaves no half-built account for the
 * user to get stuck in.
 *
 * `client` is injectable so a test can force a failure partway through the real code path
 * rather than exercising a test-only variant of it.
 */
export async function provisionNewAccount(
  input: { email: string; password: string; name: string },
  client: Client = prisma,
) {
  const passwordHash = await hashPassword(input.password)

  return client.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    })
    const team = await tx.team.create({
      data: { name: `${input.name}'s Team`, memberships: { create: { userId: user.id, role: 'OWNER' } } },
    })
    const board = await createBoardWithDefaultColumns(tx, team.id, 'My Board')
    return { user, team, board }
  })
}
