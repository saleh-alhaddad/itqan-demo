# Plan — 0001 · Task management app (teams, boards, due dates)

Task: 0001-task-management-mvp · Date: 2026-09-04 · Phase: blueprint · Plan **v2**
**v2 (2026-09-04):** adds **T10a — apply the visual language**, directed by the user after
`design.md` was revised from `design-refs/board-reference.png`. Purely visual; adds no
capability and changes no approved success criterion. It is placed before T11 deliberately:
T11's due badge must be built against the re-solved `--overdue` / `--due-soon` tokens, which
were recomputed against five card surfaces instead of one.
**APPROVED at the gate 2026-09-04** (intake Q18). The two Shape choices left open for the
gate are now settled in place below: **T03 = DB-backed session table** (Q19) ·
**T10 = `@hello-pangea/dnd`** (Q20).
Branch: `task/0001-task-management-mvp` (off `main` @ d4da6a1) · Repo: itqan-demo

Traces to `spec.md` (approved 2026-09-03) and `design.md`. Every task below names the
success criteria or invariants it serves; SC1–SC11 and I1–I7 are all covered, and the
coverage map at the end proves it both directions.

---

## Build sequence (one line)

Skeleton → schema → credentials → signup/login → **authorization guard** → board read →
columns → tasks → move → due dates → teams/members → assignees → comments → board
lifecycle → cascades → polling → permission sweep.

**Risk-first ordering.** The three things most likely to go wrong are front-loaded:
the Prisma 7 / Next 16 / Turbopack toolchain (T01), the ordering encoding (T02+T08), and
the authorization choke point (T06). Each is proven before anything is built on top of it.

---

## Step 1b — dependency reality check

Checked against the live npm registry on 2026-09-04, not from memory. Findings that
change the plan:

| Finding | Evidence | Consequence for this plan |
|---|---|---|
| **`prisma` CLI `latest` is a release candidate: `8.0.0-rc.12`, while `@prisma/client` `latest` is stable `7.10.0`.** | `npm view prisma dist-tags` → `latest: 8.0.0-rc.12`, `prev: 7.10.0`; `npm view @prisma/client dist-tags` → `latest: 7.10.0` | **Pin both to `7.10.0` exactly.** A bare `pnpm add prisma @prisma/client` installs an RC CLI against a stable client — a mismatch that fails at generate time, not install time. T01 pins and asserts the pair. |
| **Prisma 7 is ESM-only** and requires `"type": "module"` in `package.json`; `prisma-client-js` is superseded by the `prisma-client` generator, which needs an explicit `output` path. | Prisma v7 upgrade guide | T01 sets `"type": "module"` and the `prisma-client` generator with `output = "../src/generated/prisma"`. This is a T01 acceptance criterion, not a detail. |
| **Known bundling break: Prisma 7 + Next 16 + Turbopack** — generated ESM `.js` specifiers that resolve to `.ts` files on disk. | Reported against prisma/prisma and in Next 16 + Turbopack migration writeups | This is the single highest-risk item in the build, which is why T01 is a *walking skeleton that must pass a production build*, not just `next dev`. If it cannot be resolved, T01's fallback is recorded there rather than discovered in week three. |
| **Next.js 16 removed synchronous dynamic APIs.** `params`, `searchParams`, `cookies()`, `headers()` are Promises — awaiting is mandatory, and non-awaited access compiles cleanly while being broken. | Next.js 16 upgrade guide | Every route handler and page in this plan awaits `params` / `cookies()`. Called out here so no task re-learns it. `next typegen` is run in T01 to get `RouteContext`/`PageProps` helpers. |
| **`react-beautiful-dnd` is deprecated** (registry-flagged). | `npm view react-beautiful-dnd deprecated` | Excluded. See T10's Shape for the two live alternatives. |
| **`lucia` is deprecated** (registry-flagged). | `npm view lucia deprecated` | Excluded as a session library. T03 rolls the session itself — see its Shape. |
| **`shadcn-ui` is deprecated**; the CLI is now `shadcn` (4.20.1), with full Tailwind v4 + React 19 support. | `npm view shadcn-ui deprecated`; shadcn Tailwind v4 docs | T01 uses `pnpm dlx shadcn@latest init`. |
| **Both drag-and-drop candidates are stale.** `@dnd-kit/core` last published 2024-12-05 (~21 months ago); `@hello-pangea/dnd` 2025-02-09. Only `@hello-pangea/dnd` declares React 19 in its peer range. | `npm view … time` / `peerDependencies` | A real risk, mitigated structurally: T10 builds the explicit move control **first**, so the app is fully usable if the DnD library has to be dropped. |

Versions this plan targets (all verified present on the registry today):

```
next 16.3.4 · react 19.2.8 · typescript 5.x · tailwindcss 4.3.3 · shadcn 4.20.1
prisma 7.10.0 · @prisma/client 7.10.0 (pinned pair)
zod 4.5.4 · @node-rs/argon2 2.2.0 · vitest 5.0.0 · @playwright/test 1.62.1
```
Local toolchain confirmed: Node 25.2.1 · pnpm 10.30.3 · Docker 29.1.3 · PostgreSQL 18.1 · git 2.52.0.
**Package manager: pnpm** (present, and what the shadcn/Next docs assume).

---

## Decisions this plan settles

### D1 — I5 ordering encoding (the spec deferred this here explicitly)

**Decision: dense integers starting at 0, rewritten within one transaction on reorder, and
`unique(boardId, position)` / `unique(columnId, position)` are NOT created.**

Why: uniqueness plus density is self-defeating in Prisma. Shifting a run of rows
transiently collides, so a unique constraint forces either `DEFERRABLE INITIALLY DEFERRED`
(which Prisma Migrate does not express natively) or a two-phase update through negative
sentinel values — machinery bought to protect an invariant the surrounding transaction
already guarantees. Density and ordering are enforced by one funnel function plus a test
that asserts positions are exactly `0..n-1` after every reorder, which is where the
guarantee is actually checkable.

Alternative (rejected for the MVP, recorded so it is a choice and not an oversight):
sparse gap keys or fractional/lexicographic keys (`0, 1000, 2000…`, or LexoRank-style).
These make a move an O(1) single-row update and tolerate concurrent moves without
serialization — genuinely better at scale, at the cost of a rebalancing path and ordering
keys that are no longer human-readable. At MVP scale (a handful of users, a board of tens
of tasks) the dense rewrite is a sub-millisecond update of a few rows.
**Revisit when** concurrent moves on one board become routine, or a column exceeds ~500 tasks.

This is an ADR candidate for `decisions.md` (written at the end of `construct`, not now).

### D2 — One authorization funnel, not a convention

Every board-scoped route resolves access through a single `requireBoardAccess()` (and
siblings). I2 says access *is* membership; the way that stops being true is a new endpoint
whose author forgets the check. A funnel makes the check impossible to omit silently,
because the handler cannot obtain the board without passing through it. T06 builds it
before any board endpoint exists — order matters here, which is why it is not last.

### D3 — Error contract as a shared module

The uniform "absent and inaccessible are byte-identical" behaviour (I2, SC5) lives in one
`notFound()` helper. SC5 asserts byte-identity, so the response must be constructed in one
place; two hand-written 404 bodies will differ eventually.

---

## Parallelization

Strictly sequential: **T01 → T02 → T03 → T06**. These are the spine; nothing meaningful
runs before the guard exists.

Independent once T06 lands (safe to fan out):
- **{T04, T05}** — auth surface
- **{T07 → T08 → T09 → T10 → T11}** — the board column (each consumes the previous)
- **{T12 → T13}** — teams then assignees (T13 consumes T12's membership API)
- **{T14}** — comments (needs only T09)
- **{T15 → T16}** — board lifecycle then cascades

Must run last, and only once everything above is green: **T17 (polling)** and
**T18 (permission sweep)** — T18 asserts across every endpoint, so it cannot pass until
every endpoint exists.

Run mode for this task is `single` (recorded in `state.json`), so this fan-out is
information for a future run, not a dispatch plan for this one.

---

## Tasks

### Task 01 — Walking skeleton and toolchain proof
Goal:       An empty but real application that boots, talks to Postgres through Prisma 7,
            survives a production build, and runs both test runners — proving the
            Prisma 7 / Next 16 / Turbopack combination before any feature depends on it.
Consumes:   Nothing. First task.
Produces:   A buildable Next 16 app; `lib/db.ts` Prisma singleton; a running Postgres;
            Vitest + Playwright configured with working discovery; the project layout
            every later task writes into.
Acceptance: 1. `pnpm build` exits 0 (production build, not just `next dev`) with a route
               handler that reads a row from Postgres via Prisma and returns it as JSON.
            2. `pnpm prisma -v` and the installed `@prisma/client` both report **7.10.0**.
            3. `package.json` contains `"type": "module"`; the `prisma-client` generator
               has an explicit `output`; `pnpm prisma generate` exits 0.
            4. `pnpm test` runs and reports **≥1 test collected** (not merely exit 0);
               `pnpm test:e2e` runs and reports ≥1 spec collected. Zero collected is a
               discovery failure to fix, not a pass.
Shape:      Creates `package.json`, `next.config.ts`, `tsconfig.json`, `docker-compose.yml`
            (Postgres 18), `prisma/schema.prisma` (one throwaway `Healthcheck` model),
            `src/lib/db.ts`, `src/app/api/health/route.ts`, `vitest.config.ts`,
            `playwright.config.ts`, `.env.example`.
            **Reuse, not abstraction**: `pnpm dlx create-next-app` + `shadcn init` rather
            than a hand-rolled scaffold — the generators encode the Next 16 defaults
            (Turbopack, typegen, async APIs) this plan would otherwise have to restate.
            `src/lib/db.ts` is the one global singleton the codebase gets; Next dev
            hot-reload creates a new client per reload without it.
            **If the known Turbopack/Prisma ESM break bites**, the escape hatches in order
            are: (a) `serverExternalPackages: ['@prisma/client']` in `next.config.ts`,
            (b) webpack instead of Turbopack for the build, (c) stop and amend the plan.
            Do not silently downgrade Prisma — that is an amendment, not a ruling.
Size:       M
Status:     done

### Task 02 — Data model: schema, migration, test factories
Goal:       The full domain schema from the spec exists as a migration, and tests can
            build a realistic object tree in one call.
Consumes:   T01 (Prisma + Postgres proven).
Produces:   `prisma/schema.prisma` complete; an applied initial migration; `tests/factories.ts`
            exposing `makeTeamWithBoard()`, `makeUser()`, and friends. Every later task's
            tests consume these.
Acceptance: 1. `pnpm prisma migrate reset --force` on a clean database applies without error
               and the resulting schema matches `schema.prisma` (`prisma migrate diff`
               reports no drift).
            2. All 9 entities exist with the spec's fields: `User` (email citext-unique),
               `Team`, `Membership` (unique `userId,teamId`; `role` enum OWNER|MEMBER),
               `Board`, `Column`, `Task`, `TaskAssignee` (unique `taskId,userId`), `Comment`, and `Session`
               (opaque unique `token`, `userId` FK cascade, `expiresAt`, indexed on `token`)
               — added by the gate's Q19 answer.
            3. `Task.dueDate` is a **DATE**, not a timestamp — asserted by a test that
               writes a date and reads back the identical calendar day under a non-UTC `TZ`.
            4. Per D1, **no** unique constraint on `(boardId, position)` or `(columnId, position)`.
            5. A factory test builds team → board → columns → tasks → assignees → comments
               and asserts every FK resolves.
Shape:      `prisma/schema.prisma`, `prisma/migrations/*`, `tests/factories.ts`.
            Email uniqueness uses Postgres `citext` (enabled by an extension in the
            migration) rather than lowercasing in application code — one place instead of
            every call site, and it cannot be forgotten by a future query.
            `onDelete: Cascade` is declared on every FK along the ownership chain now,
            so I7 is a schema property; T16 proves it rather than implementing it.
Size:       M
Status:     done

### Task 03 — Credential and session primitives
Goal:       Password hashing and session cookies exist as tested primitives, before any
            screen uses them.
Consumes:   T02 (User model).
Produces:   `src/lib/auth/password.ts` (`hash`, `verify`); `src/lib/auth/session.ts`
            (`createSession`, `readSession`, `destroySession`); the session cookie contract.
Acceptance: 0. `destroySession` **deletes the `Session` row**, and a request replaying that
               token afterwards is rejected — revocation is asserted, not assumed. **(Q19)**
            1. A stored credential matches the argon2id encoded format (`$argon2id$…`) and
               never equals the plaintext input. **(SC11)**
            2. `verify()` returns true for the right password, false for the wrong one.
            3. `Set-Cookie` from `createSession` carries `HttpOnly`, `SameSite=Lax`,
               `Secure` in production, and `Path=/`. **(SC11)**
            4. A session read after a simulated 29 days succeeds and refreshes the expiry;
               at 31 days it fails. (30-day rolling expiry, per spec.)
Shape:      Uses `@node-rs/argon2` (native Rust bindings; no node-gyp build step, unlike
            the `argon2` package). Hashing parameters are the library defaults for the MVP —
            **tuning them is explicitly `harden`'s call, not this task's.**
            **Session storage — SETTLED at the gate (Q19): DB-backed session table.**
            The cookie carries an opaque random token (32 bytes, CSPRNG); a `Session` row
            holds `token`, `userId`, `expiresAt`. `readSession` looks the token up by its
            index and refreshes `expiresAt` on use (the 30-day rolling expiry);
            `destroySession` **deletes the row**, so logout revokes for real rather than
            merely clearing the client's copy.
            Rejected alternative: a stateless sealed cookie (`iron-session`) — ~15 lines and
            no per-request query, but logout could not revoke, there would be no "sign out
            everywhere", and it could not be retrofitted without invalidating every live
            session. The chosen cost is one indexed lookup per authenticated request,
            accepted to close a finding `harden` is otherwise certain to raise here.
            Never log or return the token; it is a bearer credential.
Size:       S
Status:     done

### Task 04 — Signup with atomic first-run provisioning
Goal:       A new signup produces a complete, immediately usable account — or nothing at all.
Consumes:   T02, T03.
Produces:   `POST /api/auth/signup`; the signup screen; the provisioning transaction that
            SC1 and SC2 both rest on; and `createBoardWithDefaultColumns()` — extracted as
            a named helper here because **T15 reuses it** for every later board.
Acceptance: 1. E2E: submit the signup form; the redirect renders a board with ≥1 column,
               with no setup step in between. **(SC1)**
            2. DB assert after that signup: `User`, `Team`, `Membership(role=OWNER)`,
               `Board`, and 3 `Column` rows ("To Do", "In Progress", "Done") all exist for
               that email. **(SC1)**
            3. Integration: force an error at board creation inside the transaction; assert
               **zero** `User` rows exist for that email afterwards. **(SC2)**
            4. No auth response body contains the submitted password. **(SC11)**
            5. A duplicate email returns a stable error `code`, not a 500.
Shape:      `src/app/api/auth/signup/route.ts`, `src/app/(auth)/signup/page.tsx`,
            `src/lib/provisioning.ts`.
            The five inserts go in **one `prisma.$transaction` callback** — this is the
            whole of SC2, so it is a single function with no branch that can commit
            partially. Input validated with a zod schema shared by the client form and the
            handler, so the two cannot disagree about what a valid signup is.
            The default columns are ordinary rows created here, not a constant the app
            treats as special (I3 stays true).
Size:       M
Status:     done

### Task 05 — Login, logout, and route protection
Goal:       An existing user can get back in, leave, and cannot reach app routes signed out.
Consumes:   T03, T04.
Produces:   `POST /api/auth/login`, `POST /api/auth/logout`, `requireUser()`, and the
            signed-out redirect behaviour every app route depends on.
Acceptance: 1. Correct credentials set a session cookie and redirect to the board list;
               wrong credentials return a **generic** failure that does not distinguish
               "no such email" from "wrong password".
            2. Logout clears the session; the previously working session no longer grants
               access on the next request.
            3. An unauthenticated request to any `(app)` route redirects to `/login`.
               — **CLOSED in T07** by `e2e/board.spec.ts`; see intake R5.
            4. The login page renders **no** "forgot password" link (there is no reset flow;
               a dead link would be dishonest — `design.md`).
Shape:      `src/app/api/auth/login/route.ts`, `logout/route.ts`,
            `src/app/(auth)/login/page.tsx`, `src/lib/auth/guard.ts` (`requireUser`).
            **Note the deliberate asymmetry with SC7**: login is intentionally vague about
            which half was wrong, while member-lookup is intentionally specific. That is
            not an inconsistency — it is a usability/enumeration trade made differently for
            an anonymous surface and an authenticated one, and `harden` is tasked with
            reconciling the member-lookup side (spec Risks).
Size:       S
Status:     done

### Task 06 — Authorization funnel and uniform error contract
Goal:       One place decides whether an actor may touch a board, and one place builds the
            404 that makes absent and inaccessible indistinguishable.
Consumes:   T02, T05.
Produces:   `requireTeamMember(actorId, teamId)`, `requireBoardAccess(actorId, boardId)`,
            `requireTeamOwner(...)`, `requireTaskAccess(...)`; `notFound()`,
            `apiError(code, message, status)`. **Every** later endpoint consumes these.
Acceptance: 1. Unit: `requireBoardAccess` resolves for a member, throws the not-found
               signal for a non-member **and** for a genuinely absent board id — the same
               signal, not two.
            2. The response `notFound()` produces is **byte-identical** in both cases,
               asserted by comparing serialized bodies and header sets. **(SC5 foundation)**
            3. `requireTaskAccess` walks task → column → board → team; there is no
               `teamId` shortcut on `Task` (spec's data model).
            4. Errors serialize as `{error: {code, message}}` with a stable `code`.
Shape:      `src/lib/auth/guard.ts`, `src/lib/api/errors.ts`.
            **New abstraction, deliberately** (rather than reuse-and-pass-args): the guards
            return the *fetched* board/task, so a handler physically cannot obtain the
            resource without passing the check. A boolean `canAccess()` helper would be
            reusable and equally correct — and equally forgettable, which is the failure
            mode I2 exists to prevent. The cost is that guards fetch, so handlers must not
            re-fetch; that is stated here so later tasks do not double-query.
            Guards throw a typed error caught by one route wrapper, so no handler
            hand-writes a 404.
Size:       S
Status:     done

### Task 07 — Board read endpoint and board screen
Goal:       A member can open a board and see its columns and cards, with all four states
            handled.
Consumes:   T06.
Produces:   `GET /api/boards/:id` — the payload **SC10**'s 10s poll re-fetches (T17) — and
            the board screen shell every later UI task renders into.
Acceptance: 1. A member receives board + columns + tasks + assignees + comment **counts**
               in one response, ordered by `position`.
            2. A non-member and an absent id both receive the identical 404 from T06 —
               this endpoint's row in **SC5**'s matrix, re-asserted wholesale in T18. **(I2)**
            3. The screen renders **loading** (skeleton cards matching final card geometry,
               no centred spinner), **empty** (a board with no columns invites creating
               one), and **error** (inline and retryable — a failure must not blank the
               board) states. **(`design.md`)**
            4. Columns scroll horizontally; each column scrolls vertically on its own; the
               page never scrolls in both directions at once.
Shape:      `src/app/api/boards/[boardId]/route.ts` (awaits `params` — Next 16),
            `src/app/(app)/boards/[boardId]/page.tsx`, `src/components/board/BoardView.tsx`,
            `ColumnView.tsx`, `TaskCard.tsx`, `BoardSkeleton.tsx`.
            One query with nested `include` rather than N+1 per column. Comment **counts**
            via `_count` — the board never ships comment bodies, which keeps the polled
            payload small (spec Risks names this payload as the thing to watch).
Size:       M
Status:     done

### Task 08 — Columns: create, rename, delete, reorder
Goal:       Columns are fully user-editable, and reordering leaves positions dense and stable.
Consumes:   T07.
Produces:   Column endpoints; `reorder()` — the single ordering funnel D1 depends on, reused
            by T10 for tasks.
Acceptance: 1. Create appends at `position = n`; rename persists; delete removes the column.
            2. After **any** reorder, the board's column positions are exactly `0..n-1`
               with no gaps and no duplicates — asserted directly, since D1 removed the
               constraint that would otherwise assert it. **(I5)**
            3. The whole reorder happens in one transaction; a forced mid-reorder failure
               leaves the original order intact.
            4. Deleting a column that contains tasks destroys those tasks, and the
               confirmation dialog **states how many** will be destroyed. **(I7)**
Shape:      `src/app/api/boards/[boardId]/columns/route.ts`,
            `src/app/api/columns/[columnId]/route.ts`, `src/lib/ordering.ts`,
            `src/components/board/ColumnHeader.tsx`, `ConfirmDialog.tsx`.
            `src/lib/ordering.ts` is written **generically over (parentId, position)** here
            so T10 reuses it for tasks rather than growing a second ordering implementation —
            two orderings is how one of them ends up subtly different.
            `ConfirmDialog` is built here as the shared destructive-action component and
            reused by T15/T16; it takes the count/name as arguments rather than each caller
            writing its own copy.
Size:       M
Status:     done

### Task 09 — Tasks: create, edit, delete, and the detail dialog
Goal:       A card can be created, opened, edited, and deleted without leaving the board.
Consumes:   T07 (T08 optional — ordering is only needed for moves).
Produces:   Task CRUD endpoints; the task detail dialog that T11/T13/T14 extend.
Acceptance: 1. Create with title only (description, due date, assignees all optional);
               title is required and an empty title is rejected with a stable `code`.
            2. The detail dialog opens **over** the board as a modal — the board stays
               mounted and its scroll position is preserved. **(`design.md`)**
            3. Focus is trapped in the dialog and returns to the originating card on close.
               **(`design.md` accessibility)**
            4. Any team member can delete a task; deletion requires confirmation. **(SC6)**
            5. No task exists outside a column, and no status field exists anywhere in the
               schema or the payload. **(I3)**
Shape:      `src/app/api/columns/[columnId]/tasks/route.ts`,
            `src/app/api/tasks/[taskId]/route.ts`,
            `src/components/board/TaskDialog.tsx`.
            Dialog is shadcn `Dialog` (Radix) on desktop and `Sheet` on mobile — the focus
            trap and return-focus behaviour come from Radix rather than being hand-rolled,
            which is the stated reason `design.md` chose this stack.
Size:       M
Status:     done

### Task 10 — Task move: pointer drag and an equal keyboard path
Goal:       A card moves between and within columns by dragging **or** by an explicit
            control, and the move survives a reload.
Consumes:   T08 (`reorder`), T09.
Produces:   `PATCH /api/tasks/:id` handling `columnId` + `position`; the move UI, both paths.
Acceptance: 1. Create a task, move it to another column, **reload** — column id and
               position index are unchanged. **(SC3)**
            2. Move is one transaction that rewrites source and destination positions to
               dense `0..n-1`. **(I5)**
            3. **Every card exposes a move action reachable by keyboard alone** that opens
               a column/position picker and completes a move with no pointer involved,
               asserted by a keyboard-only E2E test. **(`design.md` — a drag-only board is
               a defect, not a limitation.)**
            4. A card that moves announces its new column to assistive technology.
            5. An optimistic move that the server rejects rolls the card back **visibly**
               and says why — it does not silently revert. **(`design.md`)**
Shape:      `src/app/api/tasks/[taskId]/route.ts`, `src/components/board/MoveTaskMenu.tsx`,
            `src/components/board/DragContext.tsx`.
            **Build order inside this task is load-bearing: the explicit move control
            first, drag second.** Both DnD candidates are stale (Step 1b), so the app must
            be fully functional before a drag library is added. That also happens to be
            what mobile needs, where `design.md` degrades drag to this same control.
            **Drag library — SETTLED at the gate (Q20): `@hello-pangea/dnd` 18.0.1.**
            The maintained `react-beautiful-dnd` fork, and the only candidate whose peer
            range declares `react ^19`. `@dnd-kit` is not installed.
            Rejected alternative: `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 —
            a better keyboard sensor and built-in screen-reader announcements, but last
            published 2024-12-05 and its peer range (`react >=16.8`) predates React 19
            rather than affirming it. Its main advantage is one this app does not lean on,
            because acceptance #3 requires a real move control regardless of the library.
            **The build order above stands and is load-bearing**: if this dependency proves
            broken under React 19, dropping it is a `Status` change on one sub-step, not a
            redesign — the board is already fully operable without it.
Size:       M
Status:     done

### Task 10a — Apply the adopted visual language
Goal:       The board looks like `design.md` says it does: tinted cards, coloured titles,
            the three-band card anatomy, and the roomier density.
Consumes:   T07–T10 (the board and its components), `design.md` (revised 2026-09-04).
Produces:   The tint token scale in `globals.css`; `tintFor(position)`; restyled
            `TaskCard` / `ColumnView` / `ColumnHeader`; an avatar stack; count chips.
Acceptance: 1. `tintFor` is deterministic and cycles by column position — the same column
               is the same hue on every render, and a sixth column reuses the first hue.
            2. Cards render their column's tint; a card's title uses that tint's ink.
            3. **Rendered contrast is asserted in the browser**, not just in the design doc:
               an e2e reads the computed title/surface colours and requires ≥ 4.5:1.
            4. Meta text on a tinted card uses `--tint-muted-foreground`, never
               `--muted-foreground` (which measures 4.21 on these surfaces).
            5. Under `forced-colors`, tints drop out and cards fall back to a bordered
               surface — the tint is redundant encoding, so nothing is lost.
Shape:      `src/app/globals.css` (tokens, light + dark), `src/lib/tint.ts`,
            `src/components/board/{TaskCard,ColumnView,ColumnHeader,AvatarStack,CountChip}.tsx`.
            Tint reaches a card as two CSS custom properties set on the column element, so
            the card is styled by inheritance rather than by five conditional class sets.
Size:       M
Status:     done

### Task 11 — Due dates: classifier and badge
Goal:       A due date can be set and cleared, and its urgency is legible without relying
            on colour.
Consumes:   T09.
Produces:   `classifyDueDate(dueDate, today)` and the card badge.
Acceptance: 1. Unit: the classifier against fixed dates covering **yesterday / today / +1 /
               +2 / +3 / null** → overdue / due-soon / due-soon / due-soon / neither /
               neither. **(SC4)**
            2. E2E: the rendered badge matches for each of those cases. **(SC4)**
            3. A due date can be **cleared** back to null and the badge disappears. **(SC4)**
            4. The badge carries **text and an icon**, not colour alone — it survives
               greyscale. `--overdue` and `--due-soon` each meet 4.5:1 on the card surface
               in **both** light and dark themes. **(`design.md`)**
            5. Classification uses the **viewer's** local calendar date, and a test under a
               non-UTC `TZ` proves a task due "today" is not reported overdue.
Shape:      `src/lib/dates.ts` (pure, takes `today` as an argument — a function that reads
            the clock internally cannot be tested against fixed dates, which is what SC4
            requires), `src/components/board/DueBadge.tsx`, two CSS custom properties added
            to the shadcn token block.
Size:       S
Status:     done

### Task 12 — Teams and members: add by email, remove, roles
Goal:       An owner can grow and shrink a team, and the team can never be left ownerless.
Consumes:   T06.
Produces:   Team + membership endpoints; the team settings screen.
Acceptance: 1. Adding by email succeeds for an existing account; a miss returns an explicit
               "no account with that email" result, distinguishable in the body from
               success, and **never a silent success**. **(SC7)**
            2. The UI renders that miss beneath the field, explaining the person must sign
               up first. **(`design.md`)**
            3. Removing the **last owner** is rejected; demoting the last owner is
               rejected. **(I6)**
            4. Owner-only controls (rename, remove, delete team) are **hidden from members,
               not merely disabled**, and are rejected server-side for a member regardless
               of what the client sends. **(`design.md`, SC6)**
            5. A user can belong to several teams and sees each with their role.
Shape:      `src/app/api/teams/route.ts`, `src/app/api/teams/[teamId]/route.ts`,
            `src/app/api/teams/[teamId]/members/route.ts`,
            `src/app/api/teams/[teamId]/members/[userId]/route.ts`,
            `src/app/(app)/teams/[teamId]/settings/page.tsx`.
            Hiding owner controls in the UI is a courtesy; the server check is the security
            boundary. Both, and the test asserts the server one directly rather than through
            the UI.
Size:       M
Status:     done

### Task 13 — Assignees
Goal:       Tasks can be assigned to team members, and only to team members — including
            after the team changes.
Consumes:   T09, T12.
Produces:   `PUT /api/tasks/:id/assignees`; the assignee control in the task dialog; the
            membership-removal side effect.
Acceptance: 1. Assigning a user who is **not** a member of the owning team is rejected. **(I4, SC9)**
            2. After removing a member from a team, their `TaskAssignee` rows for that
               team's tasks are gone **and the tasks themselves still exist**. **(I4, SC9)**
            3. Zero, one, and several assignees on one task all work.
            4. The assignee picker offers only members of the board's team.
Shape:      `src/app/api/tasks/[taskId]/assignees/route.ts`,
            `src/components/board/AssigneePicker.tsx`, extends `src/lib/membership.ts`.
            The unassign-on-removal side effect lives **inside T12's removal transaction**,
            not in a listener or a cleanup job — a deferred cleanup means a window where I4
            is false, and I4 is an invariant, not a tendency.
Size:       S
Status:     done

### Task 14 — Comments
Goal:       Team members can discuss a task, and the two deletion rules hold.
Consumes:   T09.
Produces:   Comment endpoints; the comment thread in the task dialog.
Acceptance: 1. Any member of the board's team can post a flat, plain-text comment.
            2. **Allow-and-deny pairs**: the author can delete their own; the team owner
               can delete anyone's; a non-author non-owner member **cannot**. **(SC6)**
            3. Comment bodies are rendered as plain text — no Markdown, no HTML injection
               (asserted with a script-tag payload).
            4. Deleting a comment requires confirmation. **(`design.md`)**
Shape:      `src/app/api/tasks/[taskId]/comments/route.ts`,
            `src/app/api/comments/[commentId]/route.ts`,
            `src/components/board/CommentThread.tsx`.
            The delete rule is `author OR team owner` — expressed once in the handler, not
            split between a UI condition and a server condition that can drift.
Size:       S
Status:     done

### Task 15 — Board list and board lifecycle
Goal:       A user with more than one board can find them, create boards, and only owners
            can delete them.
Consumes:   T04 (`createBoardWithDefaultColumns()`), T07, T12.
Produces:   `GET /api/teams` + board list screen; board create/rename/delete.
            **Note (2026-09-04):** the board LIST and `listBoardsFor` were pulled forward to
            fix a user-reported bug — login pointed at `/boards`, which did not exist, so
            every login 404'd (intake R13). T15 retains create/rename/delete and grouping
            polish; acceptance #1 is already met and guarded by `e2e/login.spec.ts`.
Acceptance: 1. The board list shows boards across all the actor's teams, **grouped by team**.
               **(`design.md`)**
            2. **Any member** can create a board in their team; a new board arrives with the
               three default columns.
            3. **Allow-and-deny pair**: a member cannot delete a board; the team owner can.
               **(SC6)**
            4. Board delete requires confirmation naming the specific board and stating that
               it cannot be undone. **(`design.md`, Q14)**
Shape:      `src/app/api/teams/[teamId]/boards/route.ts`,
            `src/app/api/boards/[boardId]/route.ts` (PATCH/DELETE),
            `src/app/(app)/boards/page.tsx`.
            Default-column creation **reuses T04's provisioning helper** rather than
            duplicating the three-column literal — two copies of "the default columns" is
            exactly the pair that drifts.
Size:       S
Status:     done

### Task 16 — Cascading deletes and destructive confirmations
Goal:       Deleting anything leaves no orphan rows anywhere below it.
Consumes:   T08, T13, T14, T15.
Produces:   Proof of I7 across the whole chain; the audited set of confirmation dialogs.
Acceptance: 1. Seed a full tree (team → boards → columns → tasks → assignees → comments).
               Delete a **board**: its columns, tasks, assignments, and comments are all
               zero. **(SC8)**
            2. Delete a **team**: its boards are zero, and everything below them. **(SC8)**
            3. Delete a **column**: its tasks, their assignments and comments are zero. **(SC8)**
            4. A repo-wide check finds **no** `deletedAt` column and no soft-delete
               predicate — hard delete is the only mode. **(Q14)**
            5. Every destructive action (team, board, column, task, comment) has a
               confirmation naming the specific thing and stating irreversibility. **(`design.md`)**
Shape:      `tests/integration/cascades.test.ts`, plus any FK `onDelete` corrections in
            `prisma/schema.prisma`.
            Mostly a **proving** task, because T02 declared the cascades in the schema. If
            it finds a missing cascade the fix is a migration, and finding that here — with
            the full tree seeded — is cheaper than finding it after release.
Size:       S
Status:     todo

### Task 17 — Polling
Goal:       An open board reflects other people's changes without anyone pressing refresh.
Consumes:   T07 and every mutation task (T08–T16).
Produces:   The 10s focused-tab poll on `GET /api/boards/:id`.
Acceptance: 1. **E2E with two browser contexts**: mutate in context A; the change is visible
               in context B within a **25s** timeout. **(SC10 — two intervals plus slack,
               deliberately, because a change landing just after a poll cannot be seen until
               the next one and a 10s assertion would flake rather than fail.)**
            2. Polling **pauses** while the tab is hidden and resumes on focus, asserted via
               visibility change.
            3. The poll is **silent**: no spinner, no flash, no scroll jump. **(`design.md`)**
            4. A **failed** poll leaves the board the user is reading intact and surfaces
               inline — it must not blank the board. **(`design.md`)**
            5. If a card is mid-drag when a poll lands, the drag wins until released.
               **(`design.md`)**
Shape:      `src/components/board/useBoardPoll.ts`.
            One hook, `document.visibilityState` + an interval — deliberately not a data
            library, since the entire requirement is one endpoint on a timer and a
            dependency would be more surface than the feature.
            The spec's mitigation path (a cheap changed-since check before the full fetch)
            is **not** built now; it is recorded in `spec.md` Risks as the response if poll
            volume becomes a problem. Building it now would be scope the gate did not approve.
Size:       S
Status:     todo

### Task 18 — Authorization and permission matrix sweep
Goal:       Prove SC5 and SC6 exhaustively, across every endpoint that exists — not per
            endpoint as it was written, but all at once at the end.
Consumes:   Every prior task. **Must be last.**
Produces:   The two matrix test suites that are the acceptance evidence for SC5 and SC6.
Acceptance: 1. **One test per board-scoped endpoint** (board read, create task, move task,
               comment, delete — and every other one built) executed as a **signed-in
               non-member**: each asserts status **404** and a body **byte-identical** to
               the same request against a non-existent id. **(SC5)**
            2. The same sweep asserts the non-member **mutated nothing** — row counts
               before and after are equal. **(SC5)**
            3. **Allow-and-deny pairs** for all three destructive rules: member cannot
               delete a board / owner can · any member can delete a task · non-author
               non-owner cannot delete a comment / author can / team owner can. **(SC6)**
            4. A **completeness check**: the test enumerates the route files under
               `src/app/api` and fails if a board-scoped route exists with no entry in the
               matrix. Without this, SC5 silently stops covering endpoints added later —
               a passing suite that tests less than it did yesterday.
Shape:      `tests/integration/authz-matrix.test.ts`, `tests/integration/permissions.test.ts`.
            Table-driven over a list of `{method, path, body}` so adding an endpoint means
            adding a row, and #4 makes forgetting that row a **failure** rather than a
            quiet gap. This is the task that turns D2's funnel from a good intention into
            a checked property.
Size:       M
Status:     todo

---

## Coverage map — both directions

Every success criterion has at least one task, and every task serves a criterion (except
T01/T02, which are scaffold tasks serving all of them and mapping to none).

| Criterion | Tasks |
|---|---|
| SC1 new signup lands on a usable board | T04 |
| SC2 provisioning is atomic | T04 |
| SC3 move survives reload | T10 |
| SC4 due-date classification | T11 |
| SC5 access is exactly membership (identical 404) | T06 (funnel) → **T18** (proof) |
| SC6 three destructive-permission rules | T12, T14, T15 → **T18** (proof) |
| SC7 add member by email, explicit miss | T12 |
| SC8 deletion cascades leave no orphans | T02 (declared) → **T16** (proof) |
| SC9 assignee containment | T13 |
| SC10 change visible within two poll intervals | T17 |
| SC11 argon2id storage, cookie flags | T03, T04 |

| Invariant | Enforced by | Proven by |
|---|---|---|
| I1 board ↔ one team | T02 schema | T06, T18 |
| I2 access = membership | T06 funnel | T18 |
| I3 column *is* status | T02 (no status field), T09 | T09 |
| I4 assignee containment | T12 removal txn, T13 | T13 |
| I5 explicit dense ordering | T08 `ordering.ts` | T08, T10 |
| I6 team keeps an owner | T12 | T12 |
| I7 cascading hard delete | T02 schema | T16 |

Not-doing items are not tasks by construction — no task above introduces email, push
transport, soft delete, i18n, search, notifications, or any other named exclusion.

---

## Invariants this plan must preserve while building

Called out because they are the ones a plausible-looking change would quietly break:
- **No `teamId` on `Task`.** Adding one to "make the query easier" creates a second
  ownership path and re-opens every I2 check. If a query is awkward, join through `Column`.
- **No status field.** Ever. Not on the model, not in the API payload, not as a UI-only
  derived field that gets persisted later.
- **One `notFound()`.** A second hand-written 404 body breaks SC5's byte-identity, and the
  test that catches it is the one written last (T18).
- **One ordering funnel.** A second `position` rewrite path breaks D1's density guarantee
  in whichever path is used less.

## ADR candidates for `decisions.md`
To be written at the end of `construct`, once each has actually survived contact:
D1 (dense ordering without a unique constraint) · D2 (guards that fetch, so the check
cannot be bypassed) · T03's session-storage choice, once made at the gate.

---

## Ledger

Task artifacts on disk: intake.md ✓ · spec.md ✓ · design.md ✓ · plan.md ✓ · state.json ✓
