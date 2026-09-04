import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { provisionNewAccount } from '@/lib/provisioning'
import { SESSION_COOKIE_NAME, readSession } from '@/lib/auth/session'

afterAll(async () => { await prisma.$disconnect() })

const post = (url: string, o?: Record<string, unknown>, cookie?: string) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: o ? JSON.stringify(o) : undefined,
  })

async function anAccount() {
  const creds = {
    email: `login-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'a-perfectly-fine-password',
    name: 'Login Person',
  }
  await provisionNewAccount(creds)
  return creds
}
const tokenFrom = (res: Response) =>
  decodeURIComponent(/itqan_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '')

describe('T05 — login', () => {
  it('issues a session for correct credentials', async () => {
    const c = await anAccount()
    const res = await login(post('/api/auth/login', { email: c.email, password: c.password }))
    expect(res.status).toBe(200)
    expect(await readSession(tokenFrom(res))).not.toBeNull()
  })

  it('accepts a different-cased email, because email is case-insensitive', async () => {
    const c = await anAccount()
    const res = await login(post('/api/auth/login', { email: c.email.toUpperCase(), password: c.password }))
    expect(res.status).toBe(200)
  })

  it('gives a wrong password and an unknown email the IDENTICAL response', async () => {
    const c = await anAccount()
    const wrongPassword = await login(post('/api/auth/login', { email: c.email, password: 'not-the-password' }))
    const unknownEmail = await login(post('/api/auth/login', { email: `nobody-${Date.now()}@example.test`, password: c.password }))

    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(unknownEmail.status)
    expect(unknownEmail.status).toBe(401)
    // Byte-identical: anything that differed would say whether the account exists.
    expect(JSON.stringify(await unknownEmail.json())).toBe(JSON.stringify(await wrongPassword.json()))
  })

  it('sets no cookie on a failed login', async () => {
    const c = await anAccount()
    const res = await login(post('/api/auth/login', { email: c.email, password: 'wrong' }))
    expect(res.headers.get('set-cookie') ?? '').not.toContain(SESSION_COOKIE_NAME + '=' )
  })
})

describe('T05 — logout revokes server-side (Q19)', () => {
  it('deletes the session row, not just the browser cookie', async () => {
    const c = await anAccount()
    const token = tokenFrom(await login(post('/api/auth/login', { email: c.email, password: c.password })))
    expect(await prisma.session.findUnique({ where: { token } })).not.toBeNull()

    await logout(post('/api/auth/logout', undefined, `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`))

    expect(await prisma.session.findUnique({ where: { token } })).toBeNull()
    expect(await readSession(token)).toBeNull()
  })

  it('is harmless when called without a session', async () => {
    const res = await logout(post('/api/auth/logout'))
    expect(res.status).toBeLessThan(500)
  })
})
