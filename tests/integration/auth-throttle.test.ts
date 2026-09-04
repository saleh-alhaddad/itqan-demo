import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { provisionNewAccount } from '@/lib/provisioning'
import { FREE_ATTEMPTS } from '@/lib/auth/throttle'

afterAll(async () => { await prisma.$disconnect() })

const PASSWORD = 'a-perfectly-fine-password'
let ip: string
let ipCounter = 0

/**
 * A throttle bucket key that is unique per test AND per run.
 *
 * Two earlier attempts at this were wrong, and both failed intermittently:
 *   - a random address from one /24 — random collides, and a clash makes one test inherit
 *     another's failure count;
 *   - a counter prefixed with `Date.now() % 200` — only 200 possible prefixes, and
 *     **AuthAttempt rows persist in the test database between runs**, so separate runs
 *     collided and inherited each other's counters.
 * The key is the identifier, not an address, so it just has to be unique. A full timestamp
 * plus randomness plus a counter cannot collide within a run or across them.
 */
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
beforeEach(() => { ip = `ip-${RUN}-${++ipCounter}` })

const attempt = (url: string, body: unknown, fromIp = ip) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': fromIp },
    body: JSON.stringify(body),
  })

async function anAccount() {
  const email = `thr-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`
  await provisionNewAccount({ email, password: PASSWORD, name: 'Throttled' })
  return email
}

describe('harden C1 — login is throttled', () => {
  it('the first few wrong passwords are answered normally, so a typo costs nothing', async () => {
    const email = await anAccount()
    for (let i = 0; i < FREE_ATTEMPTS; i++) {
      const res = await login(attempt('/api/auth/login', { email, password: 'wrong' }))
      expect(res.status, `attempt ${i + 1}`).toBe(401)
    }
  })

  it('THE DEMONSTRATED ATTACK IS STOPPED: sustained guessing hits 429', async () => {
    // The audit measured ~138 unthrottled attempts/second with no lockout. This asserts the
    // control that replaced that: a burst gets refused rather than answered.
    const email = await anAccount()
    const statuses: number[] = []
    for (let i = 0; i < 10; i++) {
      statuses.push((await login(attempt('/api/auth/login', { email, password: `guess-${i}` }))).status)
    }
    expect(statuses).toContain(429)
    // And most of the burst is refused, not just the tail.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(5)
  })

  it('tells the caller how long to wait, via body and Retry-After', async () => {
    const email = await anAccount()
    let throttled: Response | null = null
    for (let i = 0; i < 10 && !throttled; i++) {
      const res = await login(attempt('/api/auth/login', { email, password: 'wrong' }))
      if (res.status === 429) throttled = res
    }
    expect(throttled).not.toBeNull()
    expect(throttled!.headers.get('Retry-After')).toMatch(/^\d+$/)
    expect((await throttled!.json()).error.code).toBe('TOO_MANY_ATTEMPTS')
  })

  it('counts the EMAIL bucket, so rotating IPs does not escape it', async () => {
    const email = await anAccount()

    // Attempt until the throttle actually engages, rather than assuming a fixed attempt
    // index does it. Attempts made DURING a cooldown are refused without incrementing the
    // counter, so how many requests it takes depends on how fast the loop runs — an earlier
    // version asserted attempt 9 and failed about two runs in five.
    let engaged = false
    for (let i = 0; i < 12 && !engaged; i++) {
      const res = await login(attempt('/api/auth/login', { email, password: 'x' }, `${ip}.${i}`))
      engaged = res.status === 429
    }
    expect(engaged, 'the throttle never engaged').toBe(true)

    // Asserted immediately, while the cooldown is known to be in force: a brand-new IP is
    // still refused, because the ADDRESS is what is being attacked.
    const fresh = await login(attempt('/api/auth/login', { email, password: 'x' }, `${ip}.fresh`))
    expect(fresh.status).toBe(429)
  })

  it('counts the IP bucket, so spraying many addresses does not escape it', async () => {
    let engaged = false
    for (let i = 0; i < 12 && !engaged; i++) {
      const res = await login(attempt('/api/auth/login', { email: `spray-${i}-${ip}@example.test`, password: 'x' }))
      engaged = res.status === 429
    }
    expect(engaged, 'the throttle never engaged').toBe(true)

    // A brand-new address from the same host, asserted while the cooldown is in force.
    const fresh = await login(attempt('/api/auth/login', { email: `spray-new-${ip}@example.test`, password: 'x' }))
    expect(fresh.status).toBe(429)
  })

  it('is a COOLDOWN, not a lockout: it always elapses', async () => {
    const email = await anAccount()
    for (let i = 0; i < 6; i++) await login(attempt('/api/auth/login', { email, password: 'x' }))

    const row = await prisma.authAttempt.findFirstOrThrow({ where: { key: `email:${email}`, kind: 'login' } })
    // A permanent lock would hand an attacker a denial of service against someone else's
    // account. The cooldown is bounded and always in the future by a finite amount.
    expect(row.nextAttemptAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000 + 1000)
  })

  it('a correct password clears the counters', async () => {
    const email = await anAccount()
    for (let i = 0; i < FREE_ATTEMPTS; i++) await login(attempt('/api/auth/login', { email, password: 'x' }))

    const ok = await login(attempt('/api/auth/login', { email, password: PASSWORD }))
    expect(ok.status).toBe(200)
    expect(await prisma.authAttempt.count({ where: { key: `email:${email}`, kind: 'login' } })).toBe(0)
  })
})

describe('harden H1 — signup enumeration is throttled', () => {
  it('probing existing addresses is slowed to a 429', async () => {
    const email = await anAccount()
    const statuses: number[] = []
    for (let i = 0; i < 10; i++) {
      statuses.push((await signup(attempt('/api/auth/signup', { email, password: PASSWORD, name: 'Probe' }))).status)
    }
    // The first probes still answer 409 — the message stays useful for a real person — but
    // a run of them is refused, which is what makes list-probing impractical.
    expect(statuses).toContain(409)
    expect(statuses).toContain(429)
  })

  it('a genuine first-time signup from a clean IP is unaffected', async () => {
    const res = await signup(attempt('/api/auth/signup', {
      email: `fresh-${Date.now()}@example.test`, password: PASSWORD, name: 'Fresh',
    }, '192.0.2.77'))
    expect(res.status).toBe(201)
  })
})
