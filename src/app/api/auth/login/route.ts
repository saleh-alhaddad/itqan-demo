import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSession, buildSessionCookie } from '@/lib/auth/session'
import { apiError, assertSameOrigin, ApiError } from '@/lib/api/errors'
import { bucketsFor, checkThrottle, clientIp, recordFailure, recordSuccess } from '@/lib/auth/throttle'

const loginSchema = z.object({ email: z.string().max(254), password: z.string().max(200) })

export async function POST(request: Request) {
  // harden M2. These do not go through handleErrors, so the check is explicit here.
  try { assertSameOrigin(request) } catch (err) {
    if (err instanceof ApiError) return apiError(err.code, err.status, err.message)
    throw err
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  // Even malformed input gets the generic credential failure: a distinct validation error
  // here would let a prober tell "this address is shaped like an account" from "it isn't".
  if (!parsed.success) return invalidCredentials()

  // harden C1. Counted against the IP and the address, so varying one does not escape the
  // other. Checked BEFORE the password is verified, so a throttled attempt costs an
  // attacker a request and costs us no argon2 work.
  const buckets = bucketsFor(clientIp(request), parsed.data.email)
  const gate = await checkThrottle(buckets, 'login')
  if (!gate.allowed) return tooManyAttempts(gate.retryAfterMs)

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })

  // Verify even when no user matched. Returning early on a missing account makes the
  // response measurably faster for unknown emails, which is a timing oracle for exactly
  // the question this endpoint refuses to answer in its body.
  const hash = user?.passwordHash ?? DUMMY_HASH
  const ok = await verifyPassword(hash, parsed.data.password)
  if (!user || !ok) {
    await recordFailure(buckets, 'login')
    return invalidCredentials()
  }

  // A genuine success clears the counters, so someone who eventually remembers their
  // password is not still paying for the earlier attempts.
  await recordSuccess(buckets, 'login')
  const { token, expiresAt } = await createSession(user.id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(buildSessionCookie(token, expiresAt))
  return res
}

/**
 * A real argon2id hash of a value nobody can supply, used to keep the work done for an
 * unknown email comparable to the work done for a known one.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zYWx0LXZhbHVl$3s5ZQm0Yk8XG6vJ4qkQxjW1nT8dR2pLbA9cVfHeMgUo'

/** One response for every failure mode, so the body never says which half was wrong. */
const invalidCredentials = () =>
  apiError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect.')

/**
 * 429 with Retry-After. Deliberately says how long rather than refusing opaquely: the
 * person on the other end is usually the account's owner having a bad morning.
 */
function tooManyAttempts(retryAfterMs: number) {
  const seconds = Math.ceil(retryAfterMs / 1000)
  const res = apiError('TOO_MANY_ATTEMPTS', 429,
    `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`)
  res.headers.set('Retry-After', String(seconds))
  return res
}
