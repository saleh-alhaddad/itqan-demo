import { requireUserOrRedirect } from '@/lib/auth/guard'
import { Toaster } from '@/components/ui/sonner'

/**
 * Every route in the (app) group is behind this layout, so authentication is structural
 * rather than something each page remembers to do — the same reasoning as the guards in
 * lib/auth/guard.ts, applied to pages instead of handlers.
 *
 * This is authentication only. AUTHORIZATION (which board, whose team) still runs per
 * request through the guards: a signed-in stranger must not reach another team's board.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect()
  return (
    <>
      {children}
      {/* Where a refused mutation says what did not happen (design.md). */}
      <Toaster position="bottom-right" />
    </>
  )
}
