import Link from 'next/link'
import { requireUserOrRedirect } from '@/lib/auth/guard'
import { listBoardsFor } from '@/lib/boards'

/**
 * Where a returning user lands after logging in.
 *
 * This route did not exist for several slices: login pushed to `/boards` while only
 * `/boards/[boardId]` was built, so every successful login landed on a 404. The whole e2e
 * suite signed up — and signup redirects straight to a board — so nothing exercised the
 * login destination at all.
 *
 * Deliberately just the list: creating, renaming and deleting boards remain T15's, and
 * this is the minimum that makes logging in correct.
 */
export default async function BoardsPage() {
  const user = await requireUserOrRedirect()
  const teams = await listBoardsFor(user.id)
  const hasAnyBoard = teams.some((team) => team.boards.length > 0)

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your boards</h1>

      {!hasAnyBoard ? (
        // Reachable once board deletion exists (T15), and reachable today for anyone
        // removed from every team they belonged to. Actionable, not a bare "No data".
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">You don&rsquo;t have any boards yet.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Boards live inside a team. Ask a team owner to add you, or create one from your
            team&rsquo;s settings.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {teams.map((team) => (
            <section key={team.id} aria-labelledby={`team-${team.id}`} data-testid="team-group">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 id={`team-${team.id}`} className="text-sm font-semibold">{team.name}</h2>
                <span className="text-muted-foreground text-xs">
                  {team.role === 'OWNER' ? 'Owner' : 'Member'}
                </span>
                {/* The only route to team settings. Without it the page exists and nothing
                    links to it — the same shape of gap as a redirect to a missing page. */}
                <Link
                  href={`/teams/${team.id}/settings`}
                  className="text-muted-foreground hover:text-foreground ml-auto text-xs underline underline-offset-4"
                >
                  Team settings
                </Link>
              </div>

              {team.boards.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                  No boards in this team yet.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {team.boards.map((board) => (
                    <li key={board.id}>
                      <Link
                        href={`/boards/${board.id}`}
                        className="hover:border-foreground/20 focus-visible:ring-ring block rounded-lg border p-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        data-testid="board-link"
                      >
                        {board.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
