import { redirect } from 'next/navigation'

/**
 * The root route.
 *
 * Previously this served create-next-app's starter page — publicly, to anonymous visitors,
 * advertising the stack and reading as an unfinished deployment (harden I1).
 *
 * `/boards` is behind the app layout, which sends a signed-out visitor to `/login`, so this
 * one redirect gives both audiences the right destination without duplicating the check.
 */
export default function RootPage() {
  redirect('/boards')
}
