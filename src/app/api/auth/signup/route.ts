import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PrismaClientKnownRequestError } from '@/generated/prisma/internal/prismaNamespace'
import { provisionNewAccount } from '@/lib/provisioning'
import { createSession, buildSessionCookie } from '@/lib/auth/session'
import { apiError } from '@/lib/api/errors'

/**
 * Signup schema, shared shape with the form so the two cannot disagree about what a valid
 * signup is. The 12-character minimum is a floor, not a policy — password rules, lockout
 * and login rate limiting are decided in the hardening pass, per the spec.
 */
export const signupSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(200),
  name: z.string().trim().min(1).max(100),
})

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiError('INVALID_INPUT', 400, 'Check the email, password and name and try again.')
  }

  let provisioned
  try {
    provisioned = await provisionNewAccount(parsed.data)
  } catch (err) {
    // P2002 = unique violation. The email column is citext, so this also catches a signup
    // that differs from an existing account only by case.
    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
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
