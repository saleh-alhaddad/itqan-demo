import { NextResponse } from 'next/server'
import { destroySession, clearedSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/session'

/**
 * Logout deletes the session ROW and then clears the cookie (Q19).
 *
 * Order matters: clearing the cookie alone would leave a valid token in the database, so a
 * copy taken beforehand would keep working. Deleting the row is what makes this revocation.
 */
export async function POST(request: Request) {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE_NAME)
  if (token) await destroySession(token)

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
