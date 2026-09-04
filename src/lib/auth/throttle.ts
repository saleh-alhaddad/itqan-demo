import { prisma } from '@/lib/db'

/**
 * Authentication throttling (harden C1).
 *
 * A **cooldown, not a lockout.** A hard account lock hands an attacker a denial-of-service:
 * fail five times against someone's address and they cannot log in either. Instead each
 * failure pushes the *next permitted attempt* further out, exponentially. A person who
 * mistypes their password waits a second; an attacker is throttled from the ~138 attempts
 * per second this audit measured down to a handful per minute, and it never becomes
 * permanent.
 *
 * Counted against BOTH the email and the client IP, so varying one does not escape the
 * other: spraying many addresses from one host still hits the IP bucket, and distributing
 * one address across hosts still hits the email bucket.
 */

/** Failures allowed before any delay — a mistyped password should cost nothing. */
export const FREE_ATTEMPTS = 3
/** The cooldown never exceeds this, so no account is ever permanently unreachable. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000
const BASE_BACKOFF_MS = 1000

/**
 * How long to refuse attempts after `failures` consecutive failures.
 *
 * Pure and exported so the policy can be asserted without a database or a clock: these
 * numbers *are* the security control.
 */
export function backoffMs(failures: number): number {
  if (!Number.isFinite(failures) || failures <= FREE_ATTEMPTS) return 0
  const over = Math.floor(failures) - FREE_ATTEMPTS
  // 1s, 2s, 4s, 8s … capped. Math.min guards the overflow at large `over`.
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(over - 1, 30))
}

export type ThrottleKind = 'login' | 'signup'

/** The buckets an attempt counts against. `email` is absent for anonymous surfaces. */
export function bucketsFor(ip: string | null, email?: string | null): string[] {
  const keys: string[] = []
  if (ip) keys.push(`ip:${ip}`)
  if (email) keys.push(`email:${email.trim().toLowerCase()}`)
  return keys
}

/**
 * Whether this attempt may proceed. Returns the wait in ms when it may not.
 *
 * Fails OPEN on a database error: a throttle that cannot read its counters must not become
 * an outage of the login page. The trade is deliberate and narrow — losing the throttle for
 * the duration of a database problem is better than locking every user out during one.
 */
export async function checkThrottle(
  keys: string[], kind: ThrottleKind, now = new Date(),
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  if (keys.length === 0) return { allowed: true }
  try {
    const rows = await prisma.authAttempt.findMany({
      where: { kind, key: { in: keys }, nextAttemptAt: { gt: now } },
      select: { nextAttemptAt: true },
    })
    if (rows.length === 0) return { allowed: true }
    const until = Math.max(...rows.map((r) => r.nextAttemptAt.getTime()))
    return { allowed: false, retryAfterMs: Math.max(0, until - now.getTime()) }
  } catch {
    return { allowed: true }
  }
}

/** Records a failure against every bucket and pushes the next permitted attempt out. */
export async function recordFailure(keys: string[], kind: ThrottleKind, now = new Date()): Promise<void> {
  await Promise.all(keys.map(async (key) => {
    const existing = await prisma.authAttempt.findUnique({ where: { key_kind: { key, kind } } })
    const failures = (existing?.failures ?? 0) + 1
    const nextAttemptAt = new Date(now.getTime() + backoffMs(failures))
    await prisma.authAttempt.upsert({
      where: { key_kind: { key, kind } },
      create: { key, kind, failures, nextAttemptAt },
      update: { failures, nextAttemptAt },
    }).catch(() => {})
  }))
}

/**
 * Clears the counters after a genuine success.
 *
 * Only the buckets given — a successful login clears that account and that IP, so a user
 * who eventually remembers their password is not still paying for the earlier attempts.
 */
export async function recordSuccess(keys: string[], kind: ThrottleKind): Promise<void> {
  if (keys.length === 0) return
  await prisma.authAttempt.deleteMany({ where: { kind, key: { in: keys } } }).catch(() => {})
}

/** The client address, from the proxy headers a hosted deployment sets. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip')
}
