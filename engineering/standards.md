# Standards — how this codebase is written

Stack:           Next.js (App Router, TypeScript) · PostgreSQL · Prisma ORM · React UI.
                 Single repo, single deploy; API surface is Next.js route handlers /
                 server actions, not a separate service.  · user-stated · 2026-09-03
Test tooling:    Vitest 5.0.0 (unit + integration, `tests/**/*.test.ts`, node env,
                 `fileParallelism: false` because integration tests share one database) and
                 Playwright 1.62.1 (e2e, `e2e/**/*.spec.ts`, chromium, webServer on :3100).
                 Commands: `pnpm test` · `pnpm test:e2e`.  · established in T01 · 2026-09-04
Auth throttling: Login and signup are throttled by a DB-backed cooldown in
                 `lib/auth/throttle.ts`, counted against email AND IP. Never add a hard
                 account lockout — it is a DoS against the real owner. See decisions.md.
                 · learned in harden · 2026-09-04
Async on close:  A surface that saves on blur must WAIT for in-flight requests before it can
                 be dismissed. Firing and forgetting loses the edit when the close is followed
                 by a navigation, and shows up as a wandering test flake rather than a clear
                 bug.  · learned in harden · 2026-09-04
Storable text:   Every user-supplied string that reaches Postgres goes through
                 `lib/api/validation.ts`. A `text` column cannot hold U+0000, and accepting
                 one produced a trivially reachable 500. Validation must check what the
                 STORAGE layer accepts, not only the string's shape.  · learned in verify · 2026-09-04
Write conflicts: Concurrent transactions touching the same rows abort with Prisma P2034.
                 That abort is CORRECT — no partial state — but transient, so it is retried
                 (bounded, P2034 only), never surfaced as a 500. Reordering is the hot path:
                 two people dragging cards on one board is the core collaborative action.
                 · learned in verify · 2026-09-04
Idempotent deletes: Use `deleteMany` for removals that can race. `delete` throws when the
                 row is already gone, and "already removed" is the desired state, not an
                 error.  · learned in verify · 2026-09-04
Dates/timezones: A test for timezone-correctness must not itself be timezone-dependent. The
                 due-date suite first built "today" from a UTC-midnight instant, so it passed
                 in Tokyo and failed in Los Angeles. Build "today" from LOCAL fields, due
                 dates from UTC fields, and run the suite under TZ=America/Los_Angeles and
                 TZ=Asia/Tokyo.  · learned in T11 · 2026-09-04
Reachability:    A page with no inbound link is unbuilt, however well it renders. Team
                 settings passed every server-side check while nothing in the UI linked to
                 it. E2E should NAVIGATE like a user (click the link) rather than jump to a
                 URL, so reachability is proven as a side effect.
                 · learned in T12 · 2026-09-04
Journey cover:   Test every ENTRY POINT a real user has, not just every behaviour. 24 e2e
                 tests missed that login landed on a 404 because all of them signed up, and
                 signup redirects elsewhere. Count journeys, not assertions.
                 · learned from a user-reported bug · 2026-09-04
Visual check:    Rendering the app and LOOKING at it is a separate step from running its
                 tests. A self-referential CSS variable made every surface fall back to
                 serif while 114 tests, lint and build stayed green — behaviour was correct
                 the whole time. `verify` takes a screenshot.  · learned in T10 · 2026-09-04
Proving set:     A slice is not green until ALL FOUR pass: `pnpm lint` · `pnpm test` ·
                 `pnpm test:e2e` · `pnpm build`. Lint is in the set because React 19's
                 `react-hooks/set-state-in-effect` caught a genuine architectural problem
                 (fetch-in-effect where the server should render), not a style nit — and it
                 was committed past once before this rule existed.  · learned in T07 · 2026-09-04
Security rule:   Team-scoped reads embed the membership predicate IN THE QUERY. Never rely
                 on a layout: Next renders layouts and pages concurrently, so a page that
                 loads unscoped data leaks it through the RSC payload even when the layout
                 returns 404. See decisions.md.  · learned in T07 · 2026-09-04
Conventions:     established in T01 (greenfield — nothing to detect) · 2026-09-04
  Package manager  pnpm 10.30.3. `pnpm-workspace.yaml` carries `onlyBuiltDependencies`
                   (prisma, @prisma/engines, esbuild, @node-rs/argon2) — pnpm 10 blocks
                   install scripts by default and Prisma silently will not work without it.
  Module system    ESM. `package.json` has `"type": "module"` — REQUIRED by Prisma 7, not a
                   preference. `.ts`/`.mjs` config files only; no CommonJS.
  Layout           `src/app` (App Router, route groups `(auth)` / `(app)`), `src/lib`
                   (framework-free logic), `src/components`, `src/generated/prisma`
                   (gitignored — `prisma generate` is a required step of a fresh checkout).
                   Tests live OUTSIDE src: `tests/integration/`, `e2e/`.
  Import alias     `@/*` → `src/*`, mirrored in tsconfig, vitest.config and next.
  Linting          ESLint 9 flat config (`eslint.config.mjs`) from `eslint-config-next`.
  Async APIs       Next 16 removed synchronous `params` / `searchParams` / `cookies()` /
                   `headers()`. ALWAYS await them — non-awaited access compiles cleanly
                   while being broken, so the compiler will not catch this for you.
  Database access  One `prisma` singleton from `src/lib/db.ts`, cached on globalThis outside
                   production (Next's dev server otherwise opens a pool per hot reload).
                   Prisma 7 has NO datasource `url`: Migrate reads it from
                   `prisma.config.ts`, the client gets it via the `@prisma/adapter-pg`
                   driver adapter. `prisma.config.ts` imports `dotenv/config` explicitly
                   because v7 no longer loads `.env` on its own.
  Databases        `itqan_dev` and `itqan_test` on local Postgres 18 :5432 (role `itqan`).
                   `tests/setup.ts` force-loads `.env.test`, so `pnpm test` can never
                   touch dev data. `docker-compose.yml` is the reproducible/CI equivalent
                   on :5433.
  Live regions     An aria-live region must live ABOVE anything that moves. A region owned
                   by a card is destroyed when the card is re-parented — by the very action
                   it exists to announce. One board-level announcer, via context.
                   · learned in T10 · 2026-09-04
  Drag handles     Spread `dragHandleProps` on a DEDICATED handle, never the card container:
                   on the container it adds role="button"/tabindex, nesting the card's own
                   buttons inside a button. The keyboard path is the explicit move menu, so
                   the handle is pointer-only (aria-hidden, tabIndex -1).
                   · learned in T10 · 2026-09-04
  React state      NEVER copy a prop into `useState`. `useState(prop)` reads its argument
                   only on the first render, so the copy freezes at mount: a
                   `router.refresh()` fetches new data on the server, hands it down, and
                   nothing changes on screen. Render from props; hold state only for values
                   the client actually owns.  · learned in T08 · 2026-09-04
  Ports            Never assume :3000 — it is occupied on the dev machine by an unrelated
                   app. E2E uses :3100; ad-hoc probes allocate a free ephemeral port.
  Node version     Works on the local Node 25.2.1, but Prisma 7 prints an unsupported-version
                   banner. **CI should pin Node 24 LTS** so that warning never masks a real
                   one.
Branch format:   task/NNNN-<slug> — suite default, adopted because the repo has no
                 existing convention to follow.  · inferred · 2026-09-03
Commit format:   conventional commits — suite default for a greenfield repo; no CI to
                 check against yet.  · inferred · 2026-09-03
Pinned versions: next 16.3.4 · react 19.2.8 · tailwindcss 4.3.3 · prisma 7.10.0 AND
                 @prisma/client 7.10.0 (**both**, exactly — the `prisma` CLI's npm `latest`
                 tag is the release candidate 8.0.0-rc.12, so an unpinned install pairs an
                 RC CLI with a stable client) · zod 4.5.4 · @node-rs/argon2 2.2.0 ·
                 vitest 5.0.0 · @playwright/test 1.62.1.  · verified against the registry · 2026-09-04
Copy source:     hardcoded-OK — the MVP is English-only, so user-facing strings may be
                 written in place. Revisit before adding any locale.  · user-stated · 2026-09-03

Domain terms:    (settled in 0001 DEFINE intake · user-stated/inferred · 2026-09-03)
  Team           — the unit of ownership and access. Owns boards. Has members with roles.
                   A single-person workspace is a Team with one member, not a special case.
  Membership     — the join between a User and a Team, carrying the role. Its EXISTENCE is
                   the authorization primitive: every access check is a membership lookup.
  Owner / Member — the only two roles. Owner: rename/delete team, manage members, delete
                   boards. Member: everything else. A team always keeps at least one owner.
  Board          — a workspace of columns belonging to exactly ONE team. Code: `Board`.
  Column         — an ordered, user-defined list on a board. A task's column IS its status;
                   there is no separate status concept anywhere in this project.
  Task           — a unit of work in exactly one column. Code: `Task` (never "card" in
                   code — "card" is UI vocabulary for the same thing).
  Assignee       — a team member attached to a task. Zero or more per task. Always
                   constrained to members of the owning team.
  Due date       — an optional plain calendar DATE on a task. Never a timestamp, so it
                   means the same day for every viewer.
  Overdue        — due date strictly before the viewer's today.
  Due-soon       — due within 2 calendar days of the viewer's today, and not overdue.
  Starter board  — the board auto-created during signup provisioning, with three default
                   columns. Those columns are ordinary editable columns, not a fixed set.
