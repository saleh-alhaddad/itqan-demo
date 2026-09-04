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

## 2026-09-04 · T03–T06 auth spine — credentials, signup, login, and the authorization funnel
- **T03** argon2id hashing (`@node-rs/argon2`) and DB-backed sessions. Logout deletes the
  row, so revocation is real; a stateless sealed cookie could only be cleared client-side.
  30-day rolling expiry, expired rows reaped on read. `readSession` takes `now` so expiry
  is testable against fixed instants.
- **T04** `provisionNewAccount` creates user + team + OWNER membership + board + three dense
  columns in ONE transaction (SC2). `createBoardWithDefaultColumns` is extracted so T15's
  board creation cannot drift from signup's.
- **T05** Login gives a wrong password and an unknown email byte-identical 401s, and verifies
  against a dummy hash when no user matched so the two paths take comparable time — an early
  return would have been a timing oracle for the question the body refuses to answer. The
  login page renders no "forgot password" link, because no reset flow exists.
- **T06** The authorization funnel. Guards RETURN the fetched resource instead of answering
  a boolean, so a handler cannot obtain a board without passing the check. Every refusal is
  the same `NOT_FOUND` — including for a member who lacks OWNER, since a 403 would confirm
  the team exists. `requireTaskAccess` walks task → column → board → team; there is no
  denormalised `teamId`.

Every security claim above was mutation-checked. Disabling revocation, dropping `httpOnly`,
ignoring expiry, removing the transaction, dropping the membership predicate, skipping the
OWNER check, and making the refusal distinguishable each turn the suite red.

**Two acceptance criteria are deferred, not done** (intake R5): T04's signup-redirect E2E
and T05's signed-out-redirect E2E both need a page that T07/T15 supply.

## 2026-09-04 · T07 board read endpoint and board screen
`GET /api/boards/:id` returns the whole board in one query — columns and tasks ordered by
position, assignees flattened, and comment **counts** rather than bodies, because this is
the payload the 10-second poll will re-fetch. Every relation uses `select`, not `include`:
an `include` on assignees would ship every User column, one of which is the password hash.

The screen implements design.md's four states: skeleton cards matching the real card
geometry (so nothing shifts when data lands), per-surface empty states, and an error state
that **keeps a board already on screen** when a re-fetch fails — which matters most once
polling makes that failure unattended. Horizontal scrolling lives in the column rail, so
the document never scrolls in two directions at once.

**Closed the two deferrals from R5**: signup-lands-on-a-board (SC1) and the signed-out
redirect are both proven end-to-end now, along with a browser-level SC5 test where a
signed-in stranger following another person's board URL gets a 404.

**A defect a passing test hid (R7):** the redirect e2e was green while the server logged an
`ApiError` on every signed-out visit — the page used the route-handler guard, which throws.
Pages now use `requireUserOrRedirect()`.

### 2026-09-04 · T07 follow-up — a real data leak, and the rule that replaced it
Adding `loading.tsx` (design.md's skeleton) put the board page inside a Suspense boundary.
That made Next stream the response, and streaming exposed a flaw in where authorization
lived: the route LAYOUT checked access while the PAGE loaded the board unscoped, and Next
renders those concurrently. The result was a 404 response whose RSC payload carried another
team's board name, column names, ids, and task titles.

Authorization now lives inside the query (`loadBoardFor(userId, boardId)`), so a non-member
gets null and there is nothing to serialise. The layout check stays as defence in depth and
to set the status before headers flush. Recorded as an ADR — it governs every future
team-scoped read.

The original test asserted only `status === 404`, which was true throughout. The regression
test asserts the response BODY, and was mutation-checked: reverting the query to unscoped
turns it red.

## 2026-09-04 · T08 columns — create, rename, delete, reorder
`lib/ordering.ts` is the single funnel that writes `position`, generic over columns and
tasks so T10 reuses it rather than growing a second implementation. It rewrites the affected
run inside one transaction, clamps an out-of-range target instead of writing a gap, and
compacts after a delete. Because D1 removed the unique constraint, the tests asserting
positions are exactly `0..n-1` ARE the density guarantee — including a randomised run of
twelve moves.

Column endpoints are membership-scoped through the guards. `DELETE` counts the tasks before
removing the column and returns `deletedTaskCount`, so the confirmation can state what the
cascade will destroy (I7) — a shared `ConfirmDialog` names the thing, states the consequence,
and says it cannot be undone, in one place so the wording cannot drift.

**Defect found (R9):** the board never updated after a mutation because `BoardView` copied
its prop into `useState`, which reads its argument only on the first render. Rendering from
props fixed it. The same freeze would have silently defeated T17's polling.
