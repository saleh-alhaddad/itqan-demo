# Intake — 0001 · Task management app (teams, boards, due dates)

Original request: "build a task-management app with teams, boards, and due dates.
Stop after the spec gate. Conduct the entire run in English: all questions, reports,
and files."

Run configuration (from the setup round):
- Role:     Principal (inferred — greenfield, multiple entities, cross-cutting authorization)
- Loop:     n/a — the run is explicitly halted after the DEFINE approval gate
- Commits:  gate (default) — no commit will be offered this run; nothing is built
- Agents:   single-agent inline (user-stated)
- Language: English for all questions, reports, and files (user-stated)

References:
- (none supplied — no ticket, design file, or document was provided with the request)

---

### Q1 · setup · 2026-09-03
Question: Where should the `engineering/` workspace live, and who can see it?
My guess: in-repo and committed, since this is a fresh personal project with no team
          history to pollute
Answer:   In repo, committed — /Users/.../itqan-demo/engineering, tracked in git
Locks:    All phase artifacts are written to that path and are team-visible through git.
          Verified against git (`check-ignore` exit 1) so the exposure is one git honors.
          Consequence carried forward: intake.md may be read by anyone who clones the
          repo, so no secret or credential is ever recorded here verbatim (§3).

### Q2 · setup · 2026-09-03
Question: How far should this be built — lean MVP or full/production?
My guess: lean MVP
Answer:   Lean MVP — core happy path, minimal surface, ship fast
Locks:    The spec targets the core happy path only. Everything cut is named explicitly
          in the spec's "Not doing" section rather than left silently absent. Scales how
          deep blueprint/construct/inspect go if the run is later continued.

### Q3 · setup · 2026-09-03
Question: Single-agent inline, or multi-agent workers for the DEFINE fresh-eyes pass?
My guess: single-agent inline (matches the session's standing "no subagents unless
          requested" rule)
Answer:   Single-agent inline
Locks:    No subagents are dispatched. The Step 3c fresh-eyes audit of spec.md is done
          inline by re-reading the written file alone, not the conversation.

---

### Q4 · define · 2026-09-03
Question: What stack should this be built on?
My guess: Next.js + Postgres + Prisma
Answer:   Next.js + Postgres + Prisma
Locks:    TypeScript end to end; the Prisma schema is the single source of truth for the
          data model; the API surface is Next.js route handlers / server actions rather
          than a separately deployed service. One repo, one deploy.

### Q5 · define · 2026-09-03
Question: How do users get accounts and sign in?
My guess: email + password, self-hosted sessions
Answer:   Email + password, self-hosted
Locks:    The app owns the users table and the credential lifecycle. Password hashing and
          session handling are in scope and are security-sensitive — this schedules the
          optional `harden` phase before any future release. No third-party identity
          vendor. Consequence: no email infrastructure is assumed to exist, which
          constrains anything that would need to send mail.

### Q6 · define · 2026-09-03
Question: What owns a board — a team, a user, or several teams?
My guess: exactly one team
Answer:   A board belongs to exactly one team
Locks:    THE central invariant of the data model. Board access derives purely from team
          membership — one rule, no special cases, no nullable owner column. A "personal"
          board is modeled as a team with one member, not a second ownership path. Every
          authorization check reduces to: is the actor a member of this board's team?

### Q7 · define · 2026-09-03
Question: Does the app need more than one language?
My guess: English only for the MVP
Answer:   English only
Locks:    No i18n framework, no message catalog, no RTL work. User-facing strings may be
          written in place. Accepted explicit debt: adding a locale later requires
          touching every component that renders text.

### Q8 · define · 2026-09-03
Question: Do teams have roles, and how does someone join one?
My guess: owner + member, add by email lookup (no mail sent)
Answer:   Owner + member; a member is added by looking up an existing registered account
          by email address
Locks:    Two roles only. No transactional email provider enters the MVP. Hard
          consequence: a person must sign up BEFORE they can be added to a team — there
          is no invite-a-stranger flow, and the UI must say so when a lookup misses.

### Q9 · define · 2026-09-03
Question: How are board columns modeled, and where does a task's status live?
My guess: user-defined columns, the column is the status
Answer:   User-defined, orderable columns; a task's column IS its status
Locks:    No separate status enum on the task — the two can never disagree because there
          is only one of them. A task belongs to exactly one column; ordering within a
          column is explicit, not incidental.

### Q10 · define · 2026-09-03
Question: What should a due date actually do?
My guess: date only, overdue shown visually, no reminders
Answer:   Date only; overdue rendered visually
Locks:    Stored as a plain calendar DATE, not a timestamp — "due Sept 10" means the same
          day for every viewer and overdue comparison is timezone-free. No scheduler, no
          reminder emails, no notifications. Due date is optional on a task.

### Q11 · define · 2026-09-03
Question: Which extras belong in the MVP? (unpicked ones become explicit exclusions)
My guess: (offered as an open multi-select, no guess)
Answer:   ALL FOUR selected — task description, multiple assignees, real-time live board
          updates, comments on tasks
Locks:    Nothing from this list is excluded. FLAGGED CONFLICT: this materially exceeds
          the "lean MVP" ambition set in Q2 — real-time in particular. Surfaced back to
          the user in round 3 rather than silently absorbed or silently dropped.

### Q12 · define · 2026-09-03
Question: Ambition conflict — "lean MVP" vs the real-time selection in Q11. Keep true
          real-time, defer it, or take a middle path?
My guess: near-real-time by polling
Answer:   Near-real-time by polling
Locks:    No websocket server, no SSE transport, no persistent connections, no fan-out
          layer. The board re-fetches on an interval while its tab is focused. Resolves
          the Q11 conflict: the ambition stays lean, and "live updates" is satisfied by
          refresh cadence rather than by push. Staleness of a few seconds is ACCEPTED and
          becomes a stated property of the product, not a defect.

### Q13 · define · 2026-09-03
Question: Inside a team, who can perform destructive actions?
My guess: owner deletes boards; any member deletes tasks; comments only by their author
Answer:   Owner deletes boards; any member deletes tasks; comments by author (or owner)
Locks:    Three distinct authorization rules layered on top of the membership check, and
          the only place in the MVP where owner and member diverge on boards/tasks.
          Each is independently testable.

### Q14 · define · 2026-09-03
Question: Hard delete or soft delete/archive?
My guess: hard delete with a confirmation step
Answer:   Hard delete, with UI confirmation
Locks:    No deletedAt column anywhere; no "exclude deleted" predicate that every future
          query must remember. Deletion cascades along ownership (team → boards →
          columns → tasks → comments). Irreversibility is a product property and the UI
          must confirm before destroying anything.

### Q15 · define · 2026-09-03
Question: What does a brand-new user see right after signing up?
My guess: auto-create a personal team plus a starter board
Answer:   Auto-create a personal team + starter board with default columns
Locks:    Signup is transactional — user, team, membership(owner), board, and default
          columns are created together or not at all. The user never sees an empty state
          on first run and never has to understand the team concept to be productive.
          Directly becomes the first success criterion.

### Q16 · define · 2026-09-03
Question: This is a UI-central app and no design direction was supplied — what should the
          interface follow? (No design tool connected; Figma requires authorization.)
My guess: shadcn/ui + Tailwind, with the visual decisions made here and recorded
Answer:   shadcn/ui + Tailwind, decisions made by the agent and recorded for overrule
Locks:    Radix-based accessible primitives vendored into the repo; Tailwind for styling;
          shadcn default tokens adopted unmodified for the MVP rather than inventing a
          visual identity on no information. Distilled into design.md, which becomes the
          source of truth construct builds against and inspect reviews against.

### Q17 · define · 2026-09-03 · APPROVAL GATE
Question: Do you approve spec.md as the basis for planning and building?
My guess: (no guess offered — a gate is the user's call, not a default)
Answer:   Approved, as written. The two flagged items were presented before the decision:
          (a) no password reset exists, and (b) real-time was resolved as polling rather
          than push. Neither was overridden.
Locks:    define.approved = true. The 16 decisions above are settled and are NOT
          re-litigated by any later phase or resumed run. The next phase is `blueprint`.
          The run halts here per the original instruction: no plan, no code, no commit.

### Q18 · blueprint · 2026-09-04 · APPROVAL GATE
Question: Do you approve plan.md as the basis for building?
My guess: (no guess offered — a gate is the user's call, not a default)
Answer:   Approved, as written. The dependency findings (Prisma RC/stable mismatch, the
          Prisma 7 + Next 16 + Turbopack bundling break, Next 16's removed synchronous
          dynamic APIs, three deprecated packages, two stale DnD libraries) and decision D1
          (dense ordering without a unique constraint) were all presented before the
          decision. None was overridden.
Locks:    blueprint.approved = true. The 18 tasks, their order, and their acceptance
          criteria are settled and are NOT re-litigated by construct. Deviating from the
          approved shape requires a plan amendment (v2 + re-approval of the changed part),
          not a ruling. Next phase: `construct`, starting at T01.
Cadence:  The user was offered "stop for review after each task" as a distinct option and
          chose "Approved as written" instead, so the run proceeds continuously through the
          task list (state.json mode.loop moved step → loop). Commit consent is UNCHANGED at
          `gate`: nothing is committed without the user's explicit approval (§12).

### Q19 · blueprint · 2026-09-04
Question: T03 — how should sessions be stored: stateless sealed cookie, or a DB-backed
          session table?
My guess: DB-backed session table
Answer:   DB-backed session table
Locks:    A `Session` model is added to the T02 schema (opaque random token in the cookie,
          userId FK, expiresAt), and T03 implements create/read/destroy against it with the
          30-day rolling expiry refreshed on read. Logout deletes the row, so revocation is
          real rather than client-side only. Consequence carried forward: every
          authenticated request costs one indexed session lookup — accepted deliberately, in
          exchange for closing a finding `harden` would otherwise raise on this surface.

### Q20 · blueprint · 2026-09-04
Question: T10 — which drag-and-drop library, given that both candidates are stale?
My guess: @hello-pangea/dnd
Answer:   @hello-pangea/dnd (18.0.1)
Locks:    The only candidate declaring `react ^19` in its peer range. `@dnd-kit` is not
          installed. T10's build order is unchanged and remains load-bearing: the explicit
          keyboard-reachable move control is built and tested FIRST, drag second, so the
          board is fully operable if this dependency later has to be dropped.

---

### R1 · construct/T01 · 2026-09-04 · RULING (not an amendment)
Situation: The plan's T01 Shape names `docker-compose.yml` as the database. The Docker
           daemon is not running on this machine, but Homebrew PostgreSQL 18.1 is live on
           :5432 and connectable.
Ruling:    Dev and test point at the local instance (`itqan_dev`, `itqan_test`, role
           `itqan`). `docker-compose.yml` is still written and committed as the
           reproducible/CI path, on :5433.
Why it is a ruling, not an amendment: the approved Shape (a Postgres 18 database reachable
           by connection string, plus a compose file) is unchanged. Which *instance* a
           developer points at is a local environment detail the gate did not decide.

### R2 · construct/T01 · 2026-09-04 · RULING
Situation: Prisma 7.10.0's preinstall prints "Prisma only supports Node.js versions 20.19+,
           22.12+, 24.0+" on this machine's Node v25.2.1.
Ruling:    Proceed on Node 25. Verified non-fatal, not assumed: `prisma -v` exits 0 with the
           query compiler enabled, `migrate dev` applied cleanly, and the production build
           and both test runners work. The banner is a stale version check that does not
           recognise 25 as satisfying "24.0+".
Follow-up: CI should pin Node 24 LTS so the warning does not become noise that hides a real
           one. Recorded in standards.md.

### R3 · construct/T01 · 2026-09-04 · RULING
Situation: Port 3000 is occupied on this machine by an unrelated application. An initial
           verification curl received HTTP 200 **from that other server**, not from ours.
Ruling:    Playwright's webServer binds :3100 (`E2E_PORT` overridable), and manual probes
           allocate a free ephemeral port. A suite that silently exercises someone else's
           app is worse than one that refuses to start.
Why it matters: this is the exact shape of a false green — the status code was right and the
           subject was wrong. Verification asserts a value only our server could produce.

### R4 · construct/T01 · 2026-09-04 · RULING — Prisma 7 API discovered at build time
Situation: Prisma 7 **removed `url` from the datasource block** (error P1012). The
           connection string now lives in `prisma.config.ts` for Migrate, and reaches the
           client at runtime through a **driver adapter**.
Ruling:    Added `@prisma/adapter-pg@7.10.0` + `pg`; `src/lib/db.ts` constructs
           `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Also added
           `prisma.config.ts` with an explicit `dotenv/config` import, because v7 no longer
           loads `.env` implicitly.
Why it is a ruling: T01's stated Goal — prove the Next 16 → Prisma 7 → Postgres path — is
           unchanged, and no other task's acceptance moves. This is the surprise T01 was
           ordered first to find; it cost one dependency instead of a mid-build redesign.

### R5 · construct/T04+T05 · 2026-09-04 · DEFERRED ACCEPTANCE (plan ordering defect)
Situation: Two approved acceptance criteria cannot be proven when their own task runs,
           because each needs a page the plan assigns to a LATER task:
           · T04 #1 — "submit signup; the redirect renders a board with >=1 column" needs
             the board screen, which is T07.
           · T05 #3 — "an unauthenticated request to any (app) route redirects to /login"
             needs an (app) route to exist; the first are T07's board and T15's board list.
Ruling:    Both are DEFERRED to the task that supplies the missing page, and recorded here
           rather than silently marked done. Everything provable now HAS been proven:
           · SC1's database half — user + team + OWNER membership + board + 3 dense columns,
             asserted directly (T04 tests).
           · SC2 in full — forcing a failure at column creation leaves zero user rows;
             mutation-checked by removing the transaction, which turns the test red.
           · The signed-out redirect exists structurally in `src/app/(app)/layout.tsx`;
             only its end-to-end proof waits for a page to sit under it.
Why flagged, not hidden: the fresh-eyes pass checked that each task's Consumes matched a
           prior Produces, but did not check that each ACCEPTANCE criterion was provable
           with only the prior tasks' output. That is a gap in the check, worth remembering
           for the next plan.
Status:    T07 and T15 must close these. Neither T04 nor T05 is marked fully validated
           until they do; `verify` re-proves both before release.

### R6 · construct/T04 · 2026-09-04 · RULING
Situation: T06's Shape names `src/lib/api/errors.ts` as its Produces, but T04's signup route
           needs a stable error `code` (its acceptance #5) before T06 runs.
Ruling:    `errors.ts` was written during T04 and T06 built its guards on top, rather than
           T04 hand-rolling an error shape for T06 to replace.
Why:       plan.md's invariants section says "One `notFound()`" — a second error shape
           existing even briefly is the thing that breaks SC5's byte-identity later.

### R5 · UPDATE · 2026-09-04 — both deferred criteria CLOSED in T07
`e2e/board.spec.ts` now proves both: signup redirects to a board rendering three columns
with no setup step (T04 #1 / SC1), and a signed-out visit to an `(app)` route lands on
`/login` (T05 #3). A third e2e also proves SC5 through the browser: a signed-in stranger
following another person's board URL receives a 404.

### R7 · construct/T07 · 2026-09-04 · DEFECT FOUND BY A PASSING TEST
Situation: the signed-out-redirect e2e PASSED while the server logged
           `⨯ Error [ApiError]: Sign in to continue.` on every signed-out visit.
Cause:     the board page called `requireUser()`, which throws an `ApiError` — the right
           idiom for a route handler, where a wrapper turns it into a 401. Thrown from a
           Server Component it escapes as an unhandled error, so an ordinary signed-out
           visit was logged at error level.
Fix:       added `requireUserOrRedirect()` for pages; handlers keep `requireUser()`. The
           layout uses it too, so the redirect lives in one place.
Worth remembering: the assertion was about the user-visible outcome and the outcome was
           correct — the defect was only visible in the server log. A green suite is not
           the same as a clean run.

### R8 · construct/T07 · 2026-09-04 · SECURITY DEFECT FOUND AND FIXED
Situation: a signed-in stranger requesting another team's board URL received HTTP 404 whose
           RSC flight payload contained the victim's board name, column names, ids, and a
           planted task title. Verified with a scripted probe, not inferred.
Cause:     access was checked in the route's LAYOUT while the PAGE loaded the board
           unscoped. Next renders layout and page concurrently, so the page's data was
           serialised into the stream even though the layout threw `notFound()`.
Fix:       authorization moved INTO the query — `loadBoardFor(userId, boardId)` carries the
           membership predicate, so a non-member gets null and there is nothing to render.
           The layout check remains as defence in depth and to set the status before the
           `loading.tsx` Suspense boundary flushes headers.
Recorded:  as an ADR in `decisions.md` — it is a rule for every future team-scoped read.
Two lessons worth keeping:
  1. **A passing test hid it.** The original e2e asserted `status === 404`, which was true
     while the body leaked. Assertions on status alone do not cover disclosure.
  2. **The design requirement caused it.** Adding `loading.tsx` for design.md's skeleton
     introduced the Suspense boundary that made the page stream; before that, the same code
     returned a clean 404. A UI requirement silently changed a security-relevant behaviour.

### R9 · construct/T08 · 2026-09-04 · DEFECT — a prop copied into state froze the board
Situation: adding a column returned 201 and the row existed in Postgres, but the board on
           screen never changed. Verified by calling the API directly against the running
           server before touching the UI, which ruled the endpoint out in one step.
Cause:     `BoardView` did `const [board] = useState(initialBoard)`. `useState` reads its
           argument only on the FIRST render, so the copy froze at mount — `router.refresh()`
           re-ran the server component and handed down fresh props that the component then
           ignored.
Fix:       render straight from props; `const board = initialBoard`. The speculative
           `refreshError` state was removed with it — T17 introduces polling state when
           there is polling to hold.
Why it mattered beyond this slice: the same freeze would have defeated T17's poll silently.
           The board would have looked correct and simply never updated.
Recorded:  as a convention in standards.md.

### R10 · construct/T09 · 2026-09-04 · RULING
Situation: T09's Shape names `PATCH /api/tasks/:id`, and T10's Shape names the same file for
           the move. Building the endpoint twice would mean editing it twice.
Ruling:    the PATCH handler was built once here, INCLUDING `columnId`/`position` handling.
           T10 still owns the move: its UI (drag plus the equal keyboard path), SC3's
           reload proof, the a11y announcement, and the optimistic rollback.
Also:      writing that handler surfaced a security-relevant path with no test — moving a
           task into a column in ANOTHER team. The destination now goes through
           `requireColumnAccess`, and a test proves it: mutation-checked by removing the
           check, which turns it red. Every READ was already boundary-safe; this was the
           first WRITE that could cross one.

### R11 · construct/T10 · 2026-09-04 · TWO DEFECTS, BOTH CAUSED BY ADDING DRAG
1. **The move announcement never survived the move.** The `aria-live` region lived inside
   `MoveTaskMenu`, i.e. inside the card — and moving a card re-parents its React subtree, so
   the region was destroyed by the action it existed to announce. Fixed with a board-level
   `BoardAnnouncer` (context + one stable region above everything that moves).
2. **Drag nested buttons inside a button.** Spreading `dragHandleProps` over the card
   container adds `role="button"` and `tabindex="0"`, so the card button and the move menu
   ended up inside a button — invalid markup, ambiguous to assistive technology, and it
   broke every existing selector. Fixed with a dedicated pointer-only handle
   (`aria-hidden`, `tabIndex -1`); keyboard users move cards through `MoveTaskMenu`.
Worth keeping: the plan's build order paid off exactly as intended. The keyboard path was
   built and proven BEFORE the drag library, so when drag broke the card's markup, the
   regression was visible immediately against working tests rather than hidden in a board
   that had never worked any other way.
Both recorded as conventions in standards.md.

### R12 · construct/T10 · 2026-09-04 · DEFECT ONLY A SCREENSHOT COULD FIND
Situation: every surface in the app rendered in the browser's default SERIF face. 91
           integration tests, 23 e2e tests, lint and build were all green.
Cause:     `src/app/globals.css` contained `--font-sans: var(--font-sans);` — a
           self-referential custom property, which resolves to nothing. `create-next-app`
           names its fonts `--font-geist-sans`; `shadcn init` wrote a rule expecting
           `--font-sans`. Two generators, each internally consistent, disagreeing at the seam.
Fix:       `--font-sans: var(--font-geist-sans)` (and `--font-heading` likewise). Also
           replaced the scaffold's leftover "Create Next App" page title.
Guard:     an e2e now asserts `--font-sans` resolves to a non-empty value and that the body
           font is not a serif fallback.
Worth keeping: **no functional assertion can see this class of defect.** Behaviour was
           correct throughout. Rendering the app and LOOKING at it is a distinct verification
           step from running its tests, and belongs in `verify`.
