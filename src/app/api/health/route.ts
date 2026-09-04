import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// This route reads from Postgres on every request, so it must never be prerendered
// or cached at build time.
export const dynamic = 'force-dynamic'

/**
 * Liveness probe. Unauthenticated by design, so it must never return application data —
 * it answers "is the database reachable", nothing more.
 */
export async function GET() {
  // A trivial round-trip to Postgres: proves the connection is live without exposing
  // any application data through an unauthenticated endpoint.
  await prisma.$queryRaw`SELECT 1`
  return NextResponse.json({ database: 'reachable' })
}
