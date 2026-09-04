import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as signup } from '@/app/api/auth/signup/route'
import { provisionNewAccount } from '@/lib/provisioning'
import { FREE_ATTEMPTS } from '@/lib/auth/throttle'

afterAll(async () => { await prisma.$disconnect() })

const PASSWORD = 'a-perfectly-fine-password'
let ip: string

/** A distinct IP per test, so buckets never leak between them. */
beforeEach(() => { ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}` })

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
    for (let i = 0; i < 8; i++) {
      await login(attempt('/api/auth/login', { email, password: 'x' }, `203.0.113.${i + 1}`))
    }
    // A fresh IP, same account — still refused, because the address is what is being attacked.
    const res = await login(attempt('/api/auth/login', { email, password: 'x' }, '203.0.113.200'))
    expect(res.status).toBe(429)
  })

  it('counts the IP bucket, so spraying many addresses does not escape it', async () => {
    for (let i = 0; i < 8; i++) {
      await login(attempt('/api/auth/login', { email: `spray-${i}@example.test`, password: 'x' }))
    }
    // A brand-new address from the same host — still refused.
    const res = await login(attempt('/api/auth/login', { email: 'spray-new@example.test', password: 'x' }))
    expect(res.status).toBe(429)
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
