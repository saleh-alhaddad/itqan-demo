import { describe, it, expect } from 'vitest'
import { backoffMs, FREE_ATTEMPTS, MAX_BACKOFF_MS } from '@/lib/auth/throttle'

/**
 * The throttle POLICY, tested as a pure function — the numbers are the security control, and
 * they should not require a database or a clock to check.
 */
describe('harden C1 — login backoff policy', () => {
  it('lets the first few failures through with no delay, so a typo costs nothing', () => {
    for (let n = 1; n <= FREE_ATTEMPTS; n++) {
      expect(backoffMs(n), `failure ${n}`).toBe(0)
    }
  })

  it('starts delaying immediately after the free attempts are spent', () => {
    expect(backoffMs(FREE_ATTEMPTS + 1)).toBeGreaterThan(0)
  })

  it('grows exponentially, so guessing gets rapidly more expensive', () => {
    const a = backoffMs(FREE_ATTEMPTS + 1)
    const b = backoffMs(FREE_ATTEMPTS + 2)
    const c = backoffMs(FREE_ATTEMPTS + 3)
    expect(b).toBeGreaterThanOrEqual(a * 2)
    expect(c).toBeGreaterThanOrEqual(b * 2)
  })

  it('is capped, so an account is never locked out permanently', () => {
    // A hard permanent lock would let an attacker deny a legitimate user their own account,
    // which is why this is a cooldown rather than a lockout.
    for (const n of [20, 100, 10_000]) {
      expect(backoffMs(n)).toBeLessThanOrEqual(MAX_BACKOFF_MS)
    }
    expect(backoffMs(10_000)).toBe(MAX_BACKOFF_MS)
  })

  it('never returns a negative or non-finite delay', () => {
    for (const n of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = backoffMs(n)
      expect(Number.isFinite(d)).toBe(true)
      expect(d).toBeGreaterThanOrEqual(0)
    }
  })

  it('slows a sustained attacker to a crawl within a minute', () => {
    // The demonstrated attack was ~138 attempts/second. Sum the enforced waits over the
    // first 12 failures and confirm the attacker is spending minutes, not milliseconds.
    let total = 0
    for (let n = 1; n <= 12; n++) total += backoffMs(n)
    expect(total).toBeGreaterThan(60_000)
  })
})
