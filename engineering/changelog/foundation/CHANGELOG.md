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

## 2026-09-04 · T09 tasks — create, edit, delete, and the detail dialog
Task endpoints are membership-scoped, append through the ordering funnel, and compact after
a delete so no hole is left (I5). Only the title is required: everything else is added later
from the dialog, so nothing stands between the user and capturing a thought. `null` and
`undefined` are distinguished in the PATCH schema — `undefined` leaves a field alone, `null`
clears it — because conflating them would make a due date impossible to clear (T11).

**A move cannot cross a team boundary.** The destination column is authorised separately;
without that check a member of one team could drop a task into another team's board. Every
read was already boundary-safe, but this was the first write that could cross one. Tested and
mutation-checked.

The detail dialog opens over the board rather than navigating, so the board stays mounted and
its scroll position survives. Radix supplies the focus trap and returns focus to the card that
opened it — proven end to end, along with a card being reachable and openable by keyboard
alone. Cards are real buttons, which is what makes that work without reimplementing it.

## 2026-09-04 · T10 task move — keyboard first, then drag
The explicit move menu was built and proven before any drag library, per the plan. It is an
equal path, not a fallback: a keyboard-ONLY end-to-end test moves a card between columns
using nothing but key presses, and would fail if a click were ever required. Moves are
announced through a board-level live region.

Drag arrived second, via `@hello-pangea/dnd` (the only candidate declaring React 19 support).
Moves are optimistic and a rejection rolls the card back visibly with a reason — a silent
revert would leave the user believing a move that never happened. `DragContext` drops its
optimistic overlay by comparing previous props during render, rather than copying props into
state (the freeze from T08).

**Adding drag caused two defects, both fixed (R11):** the live region lived inside the card
and was destroyed by the move it announced; and `dragHandleProps` on the card container put
`role="button"` around the card's own buttons. There is now a dedicated pointer-only handle.

### 2026-09-04 · T10 follow-up — the whole app was rendering in serif
`globals.css` shipped `--font-sans: var(--font-sans)`, a self-referential custom property
that resolves to nothing, so every surface fell back to the browser's default serif.
`create-next-app` names its fonts `--font-geist-sans`; `shadcn init` wrote a rule expecting
`--font-sans`. Both generators were internally consistent and disagreed at the seam.

All 114 tests, lint and the build were green throughout — behaviour was never wrong. Only a
screenshot showed it. An e2e now asserts the variable resolves and the body font is not a
serif fallback, and `standards.md` records that a visual check is its own verification step.

### 2026-09-04 · Fix — every login landed on a 404
Login redirected to `/boards`, which had no page: only `/boards/[boardId]` existed. Reported
by the user from a manual browser session.

The suite could not have caught it. All 24 e2e tests signed up, and signup redirects to
`/boards/:id`, so the login redirect was never followed by anything. The one login test
visited the page to check a reset link was absent. Behaviour coverage was good; an entire
user journey was untested.

Fixed with the minimum that makes login correct: `listBoardsFor(userId)` — membership-scoped
in the query, like every other team-scoped read — and a `/boards` page listing boards grouped
by team, with an empty state for a user who has none. Board create, rename and delete remain
T15's. The regression test signs up, logs out, logs back in and asserts no navigation
returned 404; it was mutation-checked by deleting the page again.

## 2026-09-04 · T10a applied the adopted visual language
Five-hue accent scale in `globals.css` (light + dark), cycled by column position through
`lib/tint.ts`. The column sets `--tint-surface` / `--tint-ink` once and cards inherit them,
so a card carries no knowledge of its hue and moving it between columns re-tints it for free.

Cards are now three bands — meta / title / footer — at the roomier density design.md
specifies. Assignees render as an initials avatar stack (fixed height at any count) instead
of a comma-separated list that wrapped at two names. Counts are pills carrying a spelled-out
label, since a number beside an icon says nothing to a screen reader.

**Contrast is asserted against the painted pixel, in the browser.** design.md's claim was
computed from token values; the e2e reads what Chromium actually paints and requires ≥4.5:1.
It caught its own first version — Chromium reports OKLCH as `lab(...)`, so an `rgb()` parser
read nothing — and was then mutation-checked by lightening an ink token.

`--tint-muted-foreground` replaces `--muted-foreground` on cards: the neutral token measures
4.21 on these surfaces. Under `forced-colors` the tints drop out entirely, which costs
nothing because the tint only restates which column a card is already inside.

Nothing from design.md's appendix was built. The column caret was deliberately omitted
rather than shipped inert, since it belongs to the collapsible-columns scope question.

## 2026-09-04 · T11 due dates — classifier and badge (SC4)
`classifyDueDate(due, today)` takes `today` as a parameter, which is what makes SC4's fixed
dates assertable at all. Due dates are read in UTC (a DATE column arrives as UTC midnight, so
its UTC fields are its calendar day); "today" is read locally, because today is a fact about
where the viewer is. Comparison is by calendar day, never elapsed hours — a task due 23:59
yesterday is one minute past and a whole day overdue.

The badge carries text naming the state and a per-state icon, so greyscale and colour-blindness
lose nothing. That matters more than usual here: `--due-soon` shares a hue family with the
amber column tint, so on an amber card the colour distinction is weak while the text is not.

Due dates can be set and cleared; the API already distinguished `undefined` (leave alone) from
`null` (clear), which is what makes the clear path work. Badge contrast is asserted against the
painted pixel of the tinted card it sits on.

The suite runs under four timezones spanning UTC-8 to UTC+14. Both the classifier and, at
first, the test itself had timezone bugs — see intake R16.

## 2026-09-04 · verify — PASS, after three defects found by exercising it for real
The suite was green throughout; none of these came from unit tests. All three came from an
adversarial pass written against the spec and run at a live server, and each was root-caused
and pinned with a failing test before any fix.

- **A null byte in any text field returned 500.** Postgres `text` cannot hold U+0000. The
  validation boundary checked the string's shape but not whether the storage layer could hold
  it. One `storableText` rule now covers all nine routes carrying user text.
- **Concurrent removal of the same member returned 500.** The handler read the membership
  then deleted it; a concurrent request removed it in between. `deleteMany` is idempotent,
  and removing someone already removed is the desired state.
- **Concurrent task moves returned 500** — the one that matters most, since two people
  dragging cards on the same board at once is the core collaborative action. Two reorders
  overlap and Postgres aborts one; the abort is correct but transient, and is now retried.

Also measured rather than assumed: the polled board query is p50 4.4ms with 4 SQL statements
on a 360-task board, and the payload dropped 151.3 KB → 122.3 KB after removing member email
addresses that no board component reads.

## 2026-09-04 · harden — 1 Critical and 1 High found, fixed, and re-proven
The audit measured ~138 login attempts per second with no throttle and no lockout, and found
signup disclosing whether any address has an account — the two compose into targeted
credential stuffing, made worse by there being no password reset.

Both are fixed. Login and signup now use a DB-backed exponential **cooldown** counted against
the email and the IP. Deliberately not a lockout: locking an account after N failures would
hand an attacker a denial-of-service against any user whose address they know. Re-run with the
identical probe, 96 of 100 attempts are refused and only 4 reach a password check — and the
cooldown is proven to elapse, with the correct password refused during it and accepted after.

Also fixed: `/` served create-next-app's starter page to anonymous visitors, `X-Powered-By`
advertised the framework, and `.env.example` carried a working password.

Four Mediums remain open by decision: no security headers, CSRF resting on SameSite alone,
the shadcn CLI as a runtime dependency, and sessions with no absolute lifetime.

**A non-security defect surfaced while re-verifying:** the task dialog saved on blur without
awaiting, so dismissing it left a PATCH in flight that a navigation could cancel — losing the
edit, and contradicting the file's own comment. It had been producing a wandering end-to-end
flake, a different test each run. Closing now waits for in-flight saves.

### 2026-09-04 · harden second pass — all four Mediums closed
- **M1** Six security headers plus a CSP. The CSP is honest about its limit: it keeps
  `'unsafe-inline'` for script, because Next injects inline bootstrap and the strict
  alternative is a per-request nonce needing middleware this app does not have. It stops
  cross-origin script loading, exfiltration, framing and base-URI rewriting; it does not stop
  inline injection. Proven not to break the app by the console-clean gate.
- **M2** Cross-origin mutations are refused, and the check is **structural**: `handleErrors`
  now takes the request as a required argument, so a new route cannot compile without passing
  it, and a test fails if any mutating handler is covered by neither the wrapper nor an
  explicit call.
- **M3** The `shadcn` CLI moved to devDependencies. `cn` stays — it is genuinely imported.
- **M4** A 90-day absolute session cap alongside the 30-day rolling one, measured from
  creation and never refreshed, plus sign-out-everywhere.

**M4 uncovered a gap nobody had listed: there was no way to sign out at all.** The logout
endpoint existed and no UI called it. There is now an account menu on both authenticated
surfaces — and with no password reset in this MVP, revoking every session is the only
recovery a person has if they think a cookie was stolen.

## 2026-09-04 · inspect — 3 Critical + 2 High found and closed in one round
The three Criticals were one defect: `position` was written outside the ordering funnel, in
the cross-column move and in both create paths. The funnel's own comment stated the premise
("this is the ONLY code that writes position") precisely enough that its violation was
findable — a vaguer comment would have hidden it.

Every ordering write now takes a per-parent advisory lock inside one transaction. A
transaction alone was never enough: two callers can both read `max = 4` and both write `5`
without conflicting, because they touch different rows. `appendPosition` returns `max + 1`
rather than `count()`, which collided the moment a run had a gap. `moveAcross()` performs the
reparent and both densifies in a single transaction, as the spec required all along.

Writing the tests found more than the review had: five concurrent task creates produced
`[0,0,0,1,2]`. Both create paths now append through the funnel.

All eleven client mutations go through one helper that surfaces the server's message, so a
refusal is reported rather than silently repainted as the old value — including a refused
move, which now announces the failure and never the move. The comment list is bounded to the
newest 100 with an explicit count of what is not shown.
