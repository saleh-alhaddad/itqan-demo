import { notFound } from 'next/navigation'
import { requireUserOrRedirect, requireBoardAccess } from '@/lib/auth/guard'

/**
 * Defence in depth, and the thing that gets the STATUS CODE right.
 *
 * This layout is NOT the security boundary — `loadBoardFor` is, because it scopes the
 * query by membership and so cannot be bypassed. Relying on a layout for authorization is
 * unsafe: Next renders a layout and its page concurrently, so a page loading unscoped data
 * serialises it into the RSC payload even while the layout is throwing a 404. That was a
 * real leak here, caught by a browser test asserting the status code.
 *
 * What the layout is still good for is the status itself. `loading.tsx` puts the page
 * inside a Suspense boundary, so Next flushes response headers — status 200 — along with
 * the skeleton before the page component finishes. A `notFound()` thrown from the page at
 * that point cannot change a status that has already been sent: the visitor correctly sees
 * a 404 page, but the response says 200. Layouts render BEFORE that boundary, so the status
 * is still ours to set.
 *
 * A 200 carrying not-found content is not a leak, but it is wrong for anything reading the
 * status rather than the markup — crawlers, monitors, caches, and the tests that assert
 * I2 holds.
 */
export default async function BoardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ boardId: string }>
}) {
  const { boardId } = await params
  const user = await requireUserOrRedirect()

  try {
    await requireBoardAccess(user.id, boardId)
  } catch {
    // A board in someone else's team is indistinguishable from one that does not exist (I2).
    notFound()
  }

  return <>{children}</>
}
