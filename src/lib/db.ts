import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

/**
 * The application's single PrismaClient.
 *
 * Prisma 7 has no datasource `url` in the schema: the connection reaches the client
 * through a driver adapter, constructed here from DATABASE_URL.
 *
 * The globalThis cache is not an optimisation — Next's dev server re-evaluates modules
 * on every hot reload, and without it each reload opens a new connection pool until
 * Postgres refuses new connections.
 */
const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    // Fail loudly at startup rather than at the first query, where the stack trace
    // points at unrelated application code.
    throw new Error('DATABASE_URL is not set — copy .env.example to .env')
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
