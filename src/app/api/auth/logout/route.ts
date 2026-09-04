import { NextResponse } from 'next/server'
import { apiError, assertSameOrigin, ApiError } from '@/lib/api/errors'
import { destroySession, destroyAllSessionsFor, readSession, clearedSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/session'

/**
 * Logout deletes the session ROW and then clears the cookie (Q19).
 *
 * Order matters: clearing the cookie alone would leave a valid token in the database, so a
 * copy taken beforehand would keep working. Deleting the row is what makes this revocation.
 */
export async function POST(request: Request) {
  try { assertSameOrigin(request) } catch (err) {
    if (err instanceof ApiError) return apiError(err.code, err.status, err.message)
    throw err
  }

  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE_NAME)

  // `{ everywhere: true }` signs the user out of every device (harden M4). It is the only
  // recovery available if they believe a session was stolen — there is no password reset.
  const body = (await request.json().catch(() => null)) as { everywhere?: boolean } | null

  if (token) {
    if (body?.everywhere) {
      const session = await readSession(token)
      if (session) await destroyAllSessionsFor(session.userId)
      else await destroySession(token)
    } else {
      await destroySession(token)
    }
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(clearedSessionCookie())
  return res
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}
