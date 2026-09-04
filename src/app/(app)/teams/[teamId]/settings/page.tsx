import { notFound } from 'next/navigation'
import { requireUserOrRedirect } from '@/lib/auth/guard'
import { loadTeamFor } from '@/lib/teams'
import { TeamSettings } from '@/components/team/TeamSettings'

/** Team settings. Authorisation lives in the query (`loadTeamFor`), never in a layout. */
export default async function TeamSettingsPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const user = await requireUserOrRedirect()

  const team = await loadTeamFor(user.id, teamId)
  if (!team) notFound()

  return (
    <TeamSettings
      team={team}
      viewerRole={team.viewerRole}
      viewerId={user.id}
      ownerCount={team.ownerCount}
    />
  )
}
