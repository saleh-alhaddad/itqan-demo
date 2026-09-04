import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

// Prisma 7 reads configuration from this file rather than package.json#prisma, and the
// datasource URL now lives here instead of in schema.prisma.
// `dotenv/config` above is deliberate: v7 no longer loads .env implicitly, so without it
// DATABASE_URL is undefined and every CLI command fails with a confusing error.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
    // Used by `prisma migrate diff --from-migrations`, which is the drift check that
    // catches a schema.prisma edited without a matching migration. Throwaway database:
    // Prisma resets it on every use.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
