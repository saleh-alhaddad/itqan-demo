import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/health/route'

/**
 * T01 acceptance #1 — proves a Next route handler can read a real row out of Postgres
 * through Prisma 7's driver adapter. This is the walking skeleton's only behaviour;
 * T02 replaces the Healthcheck model with the real domain schema.
 *
 * This asserts the round-tripped row, not the presence of a string: the production change
 * that breaks it is any edit that stops the handler querying the database.
 */
describe('GET /api/health', () => {
  const label = `t01-${crypto.randomUUID()}`

  beforeAll(async () => {
    await prisma.healthcheck.create({ data: { label } })
  })

  afterAll(async () => {
    await prisma.healthcheck.deleteMany({ where: { label } })
    await prisma.$disconnect()
  })

  it('returns 200 and reports the database reachable', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ database: 'reachable' })
  })

  it('reads a row that was actually written to Postgres', async () => {
    const res = await GET()
    const body = (await res.json()) as { checks: { label: string; createdAt: string }[] }

    const found = body.checks.find((c) => c.label === label)
    expect(found, 'the row inserted in beforeAll must come back through the handler').toBeDefined()
    // A real timestamp from the database, not a value the test supplied.
    expect(Number.isNaN(Date.parse(found!.createdAt))).toBe(false)
  })
})
