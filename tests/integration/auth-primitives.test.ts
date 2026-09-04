import { describe, it, expect, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  createSession, readSession, destroySession, buildSessionCookie, clearedSessionCookie,
  SESSION_TTL_MS, SESSION_COOKIE_NAME,
} from '@/lib/auth/session'
import { makeUser } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

describe('T03 — password hashing (SC11)', () => {
  it('stores an argon2id hash that is never the plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(hash).not.toBe('correct horse battery staple')
    expect(hash).not.toContain('correct horse')
  })

  it('produces a different hash each time (per-password salt)', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')])
    expect(a).not.toBe(b)
  })

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('s3cret-password')
    await expect(verifyPassword(hash, 's3cret-password')).resolves.toBe(true)
    await expect(verifyPassword(hash, 's3cret-passwore')).resolves.toBe(false)
  })

  it('returns false rather than throwing on a corrupt stored hash', async () => {
    // A user row with a mangled hash must fail login, not 500 the endpoint.
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false)
  })
})

describe('T03 — session cookie contract (SC11)', () => {
  it('is httpOnly, SameSite=Lax and scoped to the whole site', () => {
    const c = buildSessionCookie('tok', new Date(Date.now() + SESSION_TTL_MS))
    expect(c.name).toBe(SESSION_COOKIE_NAME)
    expect(c.httpOnly).toBe(true)
    expect(c.sameSite).toBe('lax')
    expect(c.path).toBe('/')
  })

  it('is Secure in production and not in development', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(buildSessionCookie('tok', new Date()).secure).toBe(true)
    vi.stubEnv('NODE_ENV', 'development')
    expect(buildSessionCookie('tok', new Date()).secure).toBe(false)
    vi.unstubAllEnvs()
  })

  it('clears by expiring immediately, not by leaving a stale value', () => {
    const c = clearedSessionCookie()
    expect(c.value).toBe('')
    expect(c.maxAge).toBe(0)
    expect(c.httpOnly).toBe(true)
  })
})

describe('T03 — session lifecycle (Q19: DB-backed, revocable)', () => {
  it('creates an opaque token that is not derived from the user id', async () => {
    const user = await makeUser()
    const { token } = await createSession(user.id)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(token).not.toContain(user.id)
    expect(token).not.toContain(user.email)
  })

  it('resolves a live session to its user', async () => {
    const user = await makeUser()
    const { token } = await createSession(user.id)
    const found = await readSession(token)
    expect(found?.user.id).toBe(user.id)
  })

  it('rejects an unknown token', async () => {
    await expect(readSession('no-such-token')).resolves.toBeNull()
  })

  it('REVOKES on destroy — the whole point of a DB-backed session (Q19)', async () => {
    const user = await makeUser()
    const { token } = await createSession(user.id)
    await destroySession(token)
    expect(await readSession(token)).toBeNull()
    expect(await prisma.session.findUnique({ where: { token } })).toBeNull()
  })

  it('accepts a session at 29 days and REFRESHES its expiry (rolling)', async () => {
    const user = await makeUser()
    const { token } = await createSession(user.id)
    const before = await prisma.session.findUniqueOrThrow({ where: { token } })

    const in29Days = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
    expect(await readSession(token, in29Days)).not.toBeNull()

    const after = await prisma.session.findUniqueOrThrow({ where: { token } })
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime())
  })

  it('rejects and deletes a session past its expiry', async () => {
    const user = await makeUser()
    const { token } = await createSession(user.id)
    const in31Days = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
    expect(await readSession(token, in31Days)).toBeNull()
    // Expired rows are reaped on read rather than accumulating forever.
    expect(await prisma.session.findUnique({ where: { token } })).toBeNull()
  })
})
