import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as signup } from '@/app/api/auth/signup/route'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

afterAll(async () => { await prisma.$disconnect() })

const body = (o: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/signup', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o),
  })

const creds = () => ({
  email: `route-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
  password: 'a-perfectly-fine-password',
  name: 'Route Person',
})

describe('T04 — POST /api/auth/signup', () => {
  it('creates the account and issues a session cookie', async () => {
    const c = creds()
    const res = await signup(body(c))
    expect(res.status).toBe(201)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(SESSION_COOKIE_NAME)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toMatch(/SameSite=Lax/i)

    // The cookie must resolve to a real session row (Q19), not just look plausible.
    const token = /itqan_session=([^;]+)/.exec(setCookie)?.[1]
    expect(token).toBeTruthy()
    const session = await prisma.session.findUnique({ where: { token: decodeURIComponent(token!) } })
    expect(session).not.toBeNull()
  })

  it('returns the board to land on, so the client never has to guess (SC1)', async () => {
    const res = await signup(body(creds()))
    const json = (await res.json()) as { boardId?: string }
    expect(json.boardId).toBeTruthy()
    const cols = await prisma.column.count({ where: { boardId: json.boardId! } })
    expect(cols).toBeGreaterThanOrEqual(1)
  })

  it('NEVER echoes the password back (SC11)', async () => {
    const c = creds()
    const res = await signup(body(c))
    const text = JSON.stringify(await res.json())
    expect(text).not.toContain(c.password)
    expect(text).not.toContain('passwordHash')
  })

  it('rejects a duplicate email with a stable code, not a 500', async () => {
    const c = creds()
    await signup(body(c))
    const res = await signup(body(c))
    expect(res.status).toBe(409)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe('EMAIL_TAKEN')
  })

  it('rejects invalid input with a stable code, not a 500', async () => {
    for (const bad of [{}, { email: 'nope', password: 'x'.repeat(12), name: 'A' }, { email: 'a@b.test', password: 'short', name: 'A' }]) {
      const res = await signup(body(bad))
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_INPUT')
    }
  })

  it('does not create a user when validation fails', async () => {
    const before = await prisma.user.count()
    await signup(body({ email: 'not-an-email', password: 'x', name: '' }))
    expect(await prisma.user.count()).toBe(before)
  })
})
