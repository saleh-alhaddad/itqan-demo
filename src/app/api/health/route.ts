import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// This route reads from Postgres on every request, so it must never be prerendered
// or cached at build time.
export const dynamic = 'force-dynamic'

/**
 * T01 walking skeleton: proves the Next 16 → Prisma 7 → Postgres path works end to end,
 * including in a production build. T02 replaces the Healthcheck model; this route is
 * kept as a liveness probe.
 */
export async function GET() {
  const checks = await prisma.healthcheck.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
  return NextResponse.json({ database: 'reachable', checks })
}
