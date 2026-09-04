import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

export const SESSION_COOKIE_NAME = 'itqan_session'
/** 30-day rolling expiry: refreshed on use, so an active user is never logged out mid-work. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Server-side sessions (gate decision Q19).
 *
 * The cookie carries only an opaque random token; everything else lives in the Session
 * table. That is what makes logout a real revocation — a stateless sealed cookie can only
 * be cleared on the client, so a copied cookie would stay valid until it expired.
 */

/** 32 bytes of CSPRNG output. Not derived from the user, so it leaks nothing if logged. */
const newToken = () => randomBytes(32).toString('base64url')

export async function createSession(userId: string, now = new Date()) {
  const token = newToken()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await prisma.session.create({ data: { token, userId, expiresAt } })
  return { token, expiresAt }
}

/**
 * Resolves a token to its session and user, sliding the expiry forward.
 *
 * `now` is a parameter rather than a call to the clock so the expiry rules are testable
 * against fixed instants. An expired session is deleted on the way out, which keeps the
 * table from growing without a scheduled job.
 */
export async function readSession(token: string, now = new Date()) {
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } })
  if (!session) return null

  if (session.expiresAt <= now) {
    await prisma.session.delete({ where: { token } }).catch(() => {})
    return null
  }

  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
  await prisma.session.update({ where: { token }, data: { expiresAt } })
  return { ...session, expiresAt }
}

/** Deletes the row: the session is revoked everywhere, not just in this browser. */
export async function destroySession(token: string) {
  await prisma.session.deleteMany({ where: { token } })
}

/**
 * The cookie contract asserted by SC11. Built as a plain object rather than written
 * straight to a response so the attributes can be tested without a request context.
 */
export function buildSessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,          // unreachable from document.cookie, so XSS cannot lift it
    sameSite: 'lax' as const, // blocks cross-site POSTs while keeping normal navigation
    secure: process.env.NODE_ENV === 'production', // false locally, where there is no TLS
    path: '/',
    expires: expiresAt,
  }
}

/** Expire immediately: a cleared cookie must not linger with a stale value. */
export function clearedSessionCookie() {
  return { ...buildSessionCookie('', new Date(0)), value: '', maxAge: 0 }
}
