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
