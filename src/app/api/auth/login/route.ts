import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSession, buildSessionCookie } from '@/lib/auth/session'
import { apiError } from '@/lib/api/errors'

const loginSchema = z.object({ email: z.string().max(254), password: z.string().max(200) })

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null))
  // Even malformed input gets the generic credential failure: a distinct validation error
  // here would let a prober tell "this address is shaped like an account" from "it isn't".
  if (!parsed.success) return invalidCredentials()

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })

  // Verify even when no user matched. Returning early on a missing account makes the
  // response measurably faster for unknown emails, which is a timing oracle for exactly
  // the question this endpoint refuses to answer in its body.
  const hash = user?.passwordHash ?? DUMMY_HASH
  const ok = await verifyPassword(hash, parsed.data.password)
  if (!user || !ok) return invalidCredentials()

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
