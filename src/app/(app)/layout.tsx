import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/guard'

/**
 * Every route in the (app) group is behind this layout, so authentication is structural
 * rather than something each page remembers to do — the same reasoning as the guards in
 * lib/auth/guard.ts, applied to pages instead of handlers.
 *
 * This is authentication only. AUTHORIZATION (which board, whose team) still runs per
 * request through the guards: a signed-in stranger must not reach another team's board.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  return <>{children}</>
}
