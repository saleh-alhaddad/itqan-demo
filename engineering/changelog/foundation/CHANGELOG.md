# Changelog — foundation (project skeleton, database access, test harness)

## 2026-09-04 · T01 walking skeleton — Next 16 + Prisma 7 + Postgres proven end to end
Task: 0001-task-management-mvp · branch `task/0001-task-management-mvp`

Established the project: Next.js 16.3.4 (App Router, TS, Turbopack), React 19.2.8,
Tailwind 4.3.3, shadcn/ui `radix-nova` (Radix primitives per `design.md`, neutral base,
CSS variables, RTL off), Prisma 7.10.0 against local Postgres 18, Vitest 5 + Playwright.

**Prisma 7 turned out to differ from the plan's assumptions in three ways** — all found
here, before 17 tasks were built on top:
- `url` is no longer allowed in the datasource block (P1012). Migrate reads it from
  `prisma.config.ts`; the client gets it through the `@prisma/adapter-pg` driver adapter.
- v7 no longer loads `.env` implicitly — `prisma.config.ts` imports `dotenv/config`.
- The `prisma` CLI's npm `latest` tag is `8.0.0-rc.12` while `@prisma/client`'s is `7.10.0`,
  so both are pinned to `7.10.0` exactly.

**The Turbopack bundling break the plan flagged did not occur.** `pnpm build` exits 0 and
the built server serves rows from Postgres; none of the three escape hatches was needed.

Also: `.gitignore` gained `!.env.example` (the scaffold's `.env*` had swallowed it), and
E2E binds :3100 because :3000 is occupied on the dev machine by an unrelated app.

## 2026-09-04 · T02 domain schema — 9 entities, one migration, test factories
Replaced T01's throwaway `Healthcheck` model with the real schema from `spec.md`:
`User` (citext email), `Session`, `Team`, `Membership`, `Board`, `Column`, `Task`,
`TaskAssignee`, `Comment`. `/api/health` became a pure `SELECT 1` liveness probe, so an
unauthenticated endpoint returns no application data.

Structural choices enforced in the database rather than in application code:
- **10 of 10 foreign keys are `ON DELETE CASCADE`**, so I7 ("no orphans") is a property of
  the schema instead of something every future delete must remember.
- **No unique index mentions `position`** (D1) — verified against `pg_indexes`. Dense
  ordering is guaranteed by a transaction plus a test, not by a constraint that would cost
  two phases to satisfy.
- **`Task.dueDate` is a real `date` column** while `createdAt` is a `timestamp` — a
  deliberate per-column decision, not a global default.
- **`citext`** is created in the migration SQL, so email uniqueness is case-insensitive in
  the database. Declaring it in `schema.prisma` would have required the
  `postgresqlExtensions` preview feature, which is a poor trade for one `CREATE EXTENSION`.
- Added `SHADOW_DATABASE_URL` so `prisma migrate diff --from-migrations` works; that is the
  check that catches a `schema.prisma` edited without a matching migration. Both drift
  checks report "No difference detected".

**A test was rewritten because it could not fail.** The original `dueDate` assertion
round-tripped a value and compared the calendar day — and passed identically when the
column was a timestamp, because Prisma normalises the value on the way out. It now asserts
the column type from `information_schema`, which was mutation-checked: switching the schema
to a plain `DateTime` turns it red.
