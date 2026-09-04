import { prisma } from '@/lib/db'

/**
 * A team with its members, for the settings screen.
 *
 * Membership-scoped in the query, like every team-scoped read: a team the actor does not
 * belong to returns null and there is nothing to render.
 */
export async function loadTeamFor(userId: string, teamId: string) {
  const team = await prisma.team.findFirst({
    where: { id: teamId, memberships: { some: { userId } } },
    select: {
      id: true,
      name: true,
      memberships: {
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { role: true, user: { select: { id: true, name: true, email: true } } },
      },
    },
  })
  if (!team) return null

  const viewerRole = team.memberships.find((m) => m.user.id === userId)?.role ?? 'MEMBER'
  return { ...team, viewerRole, ownerCount: team.memberships.filter((m) => m.role === 'OWNER').length }
}
