import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requiredText } from '@/lib/api/validation'
import { PrismaClientKnownRequestError } from '@/generated/prisma/internal/prismaNamespace'
import { provisionNewAccount } from '@/lib/provisioning'
import { createSession, buildSessionCookie } from '@/lib/auth/session'
import { apiError, assertSameOrigin, ApiError } from '@/lib/api/errors'
import { bucketsFor, checkThrottle, clientIp, recordFailure } from '@/lib/auth/throttle'

/**
 * Signup schema, shared shape with the form so the two cannot disagree about what a valid
 * signup is. The 12-character minimum is a floor, not a policy — password rules, lockout
 * and login rate limiting are decided in the hardening pass, per the spec.
 */
export const signupSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(200),
  name: requiredText(100),
})

export async function POST(request: Request) {
  // harden M2. These do not go through handleErrors, so the check is explicit here.
  try { assertSameOrigin(request) } catch (err) {
    if (err instanceof ApiError) return apiError(err.code, err.status, err.message)
    throw err
  }

  const parsed = signupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiError('INVALID_INPUT', 400, 'Check the email, password and name and try again.')
  }

  // harden H1. Signup answers 409 for an address that already exists, which is what makes
  // the form usable — and also an enumeration oracle. Rather than remove the useful message,
  // the surface is throttled per IP so probing an address list is impractical rather than
  // instant. The trade is recorded in decisions.md.
  const buckets = bucketsFor(clientIp(request))
  const gate = await checkThrottle(buckets, 'signup')
  if (!gate.allowed) {
    const seconds = Math.ceil(gate.retryAfterMs / 1000)
    const res = apiError('TOO_MANY_ATTEMPTS', 429,
      `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`)
    res.headers.set('Retry-After', String(seconds))
    return res
  }

  let provisioned
  try {
    provisioned = await provisionNewAccount(parsed.data)
  } catch (err) {
    // P2002 = unique violation. The email column is citext, so this also catches a signup
    // that differs from an existing account only by case.
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
      // A hit on an existing address counts as a failure: that is the probe we are slowing.
      await recordFailure(buckets, 'signup')
      return apiError('EMAIL_TAKEN', 409, 'An account with that email already exists.')
    }
    throw err
  }

  const { token, expiresAt } = await createSession(provisioned.user.id)

  // Only ids leave this handler: no password, no hash, no user record.
  const res = NextResponse.json({ boardId: provisioned.board.id, teamId: provisioned.team.id }, { status: 201 })
  res.cookies.set(buildSessionCookie(token, expiresAt))
  return res
}
