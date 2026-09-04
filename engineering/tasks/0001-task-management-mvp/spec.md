# Task management app — teams, boards, and due dates

Task: 0001-task-management-mvp · Date: 2026-09-03 · Phase: define

## Objective

Give a small group one shared place to see who is doing what and what is due, with no
setup ceremony in the way. A person signs up and is immediately working on a real board;
adding teammates is the only step between personal use and team use. The outcome we want
is that a team stops tracking work in chat messages and spreadsheets — not that we ship a
particular set of screens.

## Build ambition

**Lean MVP** — the core happy path, minimal surface, shipped fast. Edge cases, scale
work, and hardening are deliberately deferred and enumerated under "Not doing".

One conflict was surfaced and resolved during intake (Q11 → Q12): the requested feature
set included real-time live updates, which is infrastructure rather than a feature and
would have pushed the build past "lean". It was resolved as **near-real-time polling** —
the perceived benefit at a fraction of the cost. Staleness of up to one polling interval
is an accepted, stated property of the product, not a defect to be filed later.

## Success criteria

Every criterion below is observable and has a named proof. `verify` checks these for real;
they are the acceptance tests.

| # | Criterion | How it is proven |
|---|---|---|
| SC1 | A new signup lands on a usable board with no setup step — the post-signup screen shows a board with its default columns. | E2E: submit signup, assert the redirect renders a board with ≥1 column. DB assert: `User`, `Team`, `Membership(role=owner)`, `Board`, and default `Column` rows all exist for that email. |
| SC2 | First-run provisioning is atomic — a failure partway leaves no partial account. | Integration: force an error at board creation inside the signup transaction; assert zero `User` rows for that email afterwards. |
| SC3 | A task can be created, moved to another column, and its column and position survive a reload. | E2E: create task, move it, reload, assert column id and position index unchanged. |
| SC4 | A due date can be set and cleared. A task due before today renders overdue; a task due within 2 days renders due-soon; a task with no due date renders neither. | Unit: the date-classifier function against fixed dates covering yesterday / today / +1 / +2 / +3 / null. E2E: assert the rendered badge for each. |
| SC5 | Board access is exactly team membership — a signed-in non-member receives **404 with the identical body a genuinely absent board returns** on every board route, and can mutate nothing. | Integration: one test per board-scoped endpoint (read, create task, move task, comment, delete) executed as a non-member; each asserts status 404 **and** that the body is byte-identical to the same request against a non-existent id. |
| SC6 | The three destructive-permission rules hold in both directions. | Integration, allow-and-deny pairs: member cannot delete a board / owner can; any member can delete a task; a non-author non-owner cannot delete a comment / the author can / the team owner can. |
| SC7 | Adding a team member by email succeeds only for an existing account; a miss returns an explicit "no account with that email" result, never a silent success. | Integration: both branches, asserting the response body distinguishes them. |
| SC8 | Deletion cascades leave no orphans: deleting a board removes its columns, tasks, assignments, and comments; deleting a team removes its boards. | Integration: seed a full tree, delete at each level, assert child row counts are zero. |
| SC9 | An assignee must be a team member. Removing a member from a team unassigns them from that team's tasks without deleting the tasks. | Integration: assigning a non-member is rejected; after removing a member, their assignment rows are gone and the task rows remain. |
| SC10 | A change made by one user appears in another user's already-open board within **two poll intervals (25s)** without manual refresh. | E2E with two browser contexts: mutate in context A, assert the change is visible in context B inside a 25s timeout. The budget is deliberately two intervals plus slack: a change landing immediately after a poll cannot be seen until the next one, so a 10s assertion would flake rather than fail. |
| SC11 | Passwords are stored only as argon2id hashes and never appear in a response body; session cookies are httpOnly and SameSite. | Integration: assert the stored credential matches the argon2id hash format and never equals the input; assert no auth response body contains the submitted password; assert `Set-Cookie` carries `HttpOnly` and `SameSite`. (The stronger "never written to any log" claim is not provable by a test at this level — it is enforced by a logging-redaction rule and verified in `harden`.) |

## Scope

**Accounts**
- Sign up with email + password; log in; log out.
- On signup, provision in one transaction: the user, a team they own, their owner
  membership, a starter board, and that board's default columns.

**Teams**
- Two roles: `owner` and `member`.
- Owner can rename the team, add a member by looking up an existing account by email
  address, remove a member, and delete the team.
- A user may belong to any number of teams.

**Boards**
- A board belongs to exactly one team. Access to a board is membership in that team —
  there is no other access path.
- Any member can create a board in their team; only the team owner can delete one.
- Columns are user-defined per board: create, rename, reorder, delete.

**Tasks**
- Fields: title (required), description (optional free text), due date (optional, a
  calendar date with no time), assignees (zero or more team members), column, position.
- A task sits in exactly one column, and that column is its status — there is no separate
  status field, so the two cannot disagree.
- Create, edit, move between and within columns, delete.
- Due date renders as overdue (before today), due-soon (within 2 days), or neither.

**Comments**
- Flat, plain-text comments on a task by any member of the board's team.
- Deletable by the comment's author or by the team owner.

**Freshness**
- An open board re-fetches its data every 10 seconds while its tab is focused, and pauses
  while it is not.

**UI** — see `design.md` in this task folder for screens, states, tokens, and
accessibility intent. That file is the source of truth `construct` builds against and
`inspect` reviews against.

## Not doing

Named exclusions, so scope cannot drift into them silently:

- **Password reset and any email at all.** No mail provider is in the MVP, so there is no
  reset flow, no email verification, and no invitations to people without an account. See
  Risks — this is the most consequential exclusion.
- **Inviting people who have not signed up.** Adding a member requires an existing account.
- **Leaving a team on your own.** Only the team owner removes members; a member cannot
  exit unilaterally. Stated rather than omitted, because it is a real trap: a member added
  to a team they do not want is stuck until an owner acts.
- **True push real-time** (websockets, SSE, presence indicators, live cursors).
- **Notifications** of any kind — email, push, in-app, digest, or reminder.
- **Internationalization.** English only, strings written in place, no RTL.
- **Soft delete, archive, trash, or undo.** Deletion is permanent.
- **Labels, tags, priorities, checklists, subtasks, attachments, file uploads.**
- **Threaded comments, @-mentions, reactions, rich text, or Markdown in comments.**
- **Task history, activity feed, or audit log.**
- **Filtering, search, saved views, calendar view, or cross-board views.**
- **Recurring tasks or task templates.**
- **Billing, plans, seat limits, or usage quotas.**
- **Admin console, analytics, or reporting.**
- **Mobile applications.** The web UI is responsive; there is no native app.
- **Third-party integrations** (calendar sync, Slack, GitHub, import/export).

### Declined from the design reference · 2026-09-04

`design-refs/board-reference.png` was adopted for its **visual language only**. Every
capability it shows that this product lacks was put to the user as an explicit scope
question and **declined for this version**. Recorded here, in the spec's own exclusion list,
so the decision has one home and is not re-litigated by a later reading of the reference.

- **B1 — Tags / labels.** Already excluded above; restated because the reference's entire
  card layout is built around a tag row, and a future reader may mistake its absence for an
  oversight rather than a decision.
- **B2 — Progress bars and percentages.** Declined. Note it has **no honest data source
  without B3**: the only alternatives are a manual number that goes stale the moment it is
  not updated, or derivation from checklists, which are themselves declined. A progress bar
  nobody maintains is worse than none, because it is believed.
- **B3 — Checklists / subtasks.** Already excluded above; restated as the missing
  prerequisite for B2.
- **B4 — Attachments and attachment counts.** Already excluded above.
- **B5 — Image thumbnails on cards.** Declined; a subset of B4.
- **B6 — Global search.** Already excluded above.
- **B7 — Suite navigation** (dashboard, schedule, notes, products, reports, clients,
  support). Declined. These are separate products; the reference is a suite and this is one
  board application.
- **B8 — Collapsible columns.** Declined. Small in appearance, but it is per-user persisted
  UI state, of which this product currently has none. The column caret drawn in `design.md`'s
  anatomy sketch was deliberately **not built**, rather than shipped inert.
- **B9 — Photograph avatars.** Declined. The data model stores a name and an email; avatars
  render as initials. A photograph would require upload (⊆ B4) or a third-party dependency.
- **B10 — Times of day on cards.** Declined — and unlike the rest, this is a **contradiction,
  not an absence**. `Task.dueDate` is a calendar DATE with no time *by decision*, so that a
  due date means the same day for every viewer. Adding a time would reopen the timezone
  question this spec closed deliberately, and would invalidate SC4's proof. Declining B10 is
  therefore not a scope choice but an upholding of an existing one.
- **Multi-factor authentication, SSO, or OAuth providers.**
- **Offline support or optimistic-conflict resolution.**

## Data model & contracts

### Entities and relationships

```
User      id · email (unique, citext) · passwordHash · name · createdAt
Team      id · name · createdAt
Membership  id · userId → User · teamId → Team · role: OWNER|MEMBER · createdAt
            unique(userId, teamId)
Board     id · teamId → Team · name · createdAt
Column    id · boardId → Board · name · position (int) · createdAt
            unique(boardId, position)   — see invariant I5
Task      id · columnId → Column · title · description (nullable) ·
            dueDate (DATE, nullable) · position (int) · createdAt · updatedAt
TaskAssignee  taskId → Task · userId → User · unique(taskId, userId)
Comment   id · taskId → Task · authorId → User · body (text) · createdAt
```

`Board` reaches its team directly; `Task` reaches its board through `Column`. There is no
denormalized `teamId` on `Task` — the ownership chain is the single path, so it cannot
disagree with itself.

### Invariants

- **I1 — Board ownership.** Every board has exactly one team. There is no user-owned
  board and no board shared across teams. A "personal" board is a board in a team with
  one member. *This is the load-bearing invariant; every authorization check reduces to it.*
- **I2 — Access.** A user may read or mutate anything under a board if and only if a
  `Membership` row joins them to that board's team. Absence of membership is
  indistinguishable from a non-existent board in the response.
- **I3 — Status identity.** A task's column is its status. No task exists outside a
  column, and no status is stored anywhere else.
- **I4 — Assignee containment.** Every `TaskAssignee.userId` is a member of the team
  owning the task's board. Removing a `Membership` deletes that user's assignment rows
  for that team's tasks; the tasks themselves survive.
- **I5 — Ordering.** `Column.position` within a board and `Task.position` within a column
  are explicit integers, dense and starting at 0. Reordering rewrites the affected
  positions inside one transaction. (A dense unique constraint requires deferred checks or
  a two-step update; if that proves awkward in Prisma, positions may become sparse
  ordering keys — a `blueprint`-level decision, recorded here as the intent: order is
  explicit and stable, never derived from `createdAt`.)
- **I6 — Team survival.** A team always has at least one `OWNER`. The last owner cannot
  be removed or demoted; they must delete the team instead.
- **I7 — Deletion.** Deletes cascade strictly down the ownership chain:
  team → boards → columns → tasks → (assignments, comments). Nothing is soft-deleted, and
  no orphan may survive a delete. Because a column delete destroys the tasks inside it,
  its confirmation dialog must state how many tasks will be destroyed — a cascade the user
  cannot see is the one that surprises them.

### Contracts

Server-side mutations are Next.js route handlers / server actions. Every one of them, with
no exception, resolves the actor's session first and re-checks I2 against the target's
team — authorization is never inferred from the fact that a client had the id.

```
POST   /api/auth/signup        {email, password, name} → session cookie; performs the
                               atomic first-run provisioning of SC1/SC2
POST   /api/auth/login         {email, password} → session cookie
POST   /api/auth/logout        → clears session

GET    /api/teams              → teams the actor belongs to, with their role
POST   /api/teams              {name}
PATCH  /api/teams/:id          {name}                       owner only
DELETE /api/teams/:id          → cascades (I7)              owner only
POST   /api/teams/:id/members  {email} → 200 added | 404 no-account-with-that-email (SC7)
DELETE /api/teams/:id/members/:userId  → also clears assignments (I4)   owner only;
                               rejected if it would remove the last owner (I6)

GET    /api/boards/:id         → board with columns, tasks, assignees, comment counts.
                               This is the endpoint the 10s poll re-fetches.
POST   /api/teams/:id/boards   {name} → board + default columns
PATCH  /api/boards/:id         {name}
DELETE /api/boards/:id         → cascades                   team owner only

POST   /api/boards/:id/columns {name}
PATCH  /api/columns/:id        {name?, position?}
DELETE /api/columns/:id        → cascades to its tasks

POST   /api/columns/:id/tasks  {title, description?, dueDate?}
PATCH  /api/tasks/:id          {title?, description?, dueDate?|null, columnId?, position?}
                               — the move operation; one transaction (I5)
PUT    /api/tasks/:id/assignees {userIds[]} → rejected if any is not a team member (I4)
DELETE /api/tasks/:id          → any member

POST   /api/tasks/:id/comments {body}
DELETE /api/comments/:id       → author or team owner only
```

**Error contract.** Failures return a JSON body `{error: {code, message}}` with a stable
machine-readable `code`. Authorization failures on team-scoped resources return the same
shape and status whether the resource is absent or merely inaccessible (I2), so the API
does not leak the existence of other teams' data.

**Transactional requirements.** Three operations must be all-or-nothing:
signup provisioning (SC2), task move with reordering (I5), and any cascading delete (I7).

**Retention & PII.** Stored personal data is limited to email address and display name.
Passwords are stored only as argon2id hashes and are never logged, never returned by any
endpoint, and never included in an error message. Deleting a user is out of scope for the
MVP — recorded as a gap under Risks, since it has data-protection implications.

## Constraints & assumptions

**Constraints (settled in intake, not open):**
- Next.js (App Router, TypeScript) · PostgreSQL · Prisma. Single repo, single deploy.
- Self-hosted email+password auth. No identity vendor.
- No email infrastructure of any kind.
- English only; no i18n layer.
- Hard deletes only.
- shadcn/ui + Tailwind for the interface (see `design.md`).

**Assumptions (defaults taken, correctable):**
- "Due soon" means due within 2 calendar days; overdue means before today. Both are
  evaluated against the *viewer's* local date — safe to do because the due date is a plain
  date, not an instant.
- The board poll interval is 10 seconds, and polling pauses while the tab is hidden.
- Cards move by drag-and-drop, with a keyboard-operable "move to column" control as an
  equal-capability fallback rather than an afterthought.
- Passwords are hashed with argon2id; sessions are httpOnly, SameSite=Lax cookies with a
  **30-day rolling expiry** — refreshed on activity, so an active user is not logged out
  mid-work and an abandoned session lapses. Exact password policy, lockout, and login
  rate limiting are decided in `harden`, not here.
- Comments are flat and plain text.
- Team and board names need not be unique.
- No deployment target is assumed. Polling was chosen partly so that a serverless host
  remains viable.
- A default new board is created with three columns ("To Do", "In Progress", "Done") —
  they are ordinary user-editable columns, not a fixed set (I3 still holds).

## Risks & open questions

| Risk | Current best answer |
|---|---|
| **No password reset.** Email+password with no mail provider means a forgotten password locks a user out permanently, with no recovery path. This is the single largest product risk in the MVP. | Accepted for the MVP as the direct consequence of the no-email decision (Q5, Q8). Mitigation if it becomes real: add a transactional email provider, which unlocks reset, verification, and true invitations together — one dependency, three features. Flagged for reconsideration before any real users exist. |
| Self-hosted credentials are a security-sensitive surface (hashing, session fixation, login brute-force, enumeration via the member-lookup endpoint). | The optional **`harden`** phase is scheduled before any release and is recorded in the ledger. SC11 covers only the storage floor; harden covers the rest. Note that SC7's "no account with that email" response is deliberately useful to users *and* an enumeration oracle — harden must reconcile those. |
| Polling every 10 seconds per open board multiplies database reads with concurrent users. | Acceptable at MVP scale. The `GET /api/boards/:id` payload is the thing to watch; if it becomes a problem the mitigation is a cheap changed-since check before the full fetch, not a switch to websockets. |
| Drag-and-drop is the primary interaction and is the classic accessibility failure in board apps. | The keyboard fallback is specified as an equal path, not a degraded one, and is called out in `design.md`. `inspect` should treat a drag-only implementation as a defect. |
| Hard delete with no undo means one mis-click destroys a board of work irreversibly. | Confirmation dialogs are required on every destructive action (Q14). If loss reports appear, the fix is soft delete — which is a schema migration plus a predicate on every query, and is why it was declined now. |
| Dense integer positions (I5) are awkward to maintain under concurrent moves. | Flagged for `blueprint` to settle. The spec commits to explicit stable ordering, not to a particular encoding of it. |
| No user deletion / account closure. | Out of MVP scope, but it carries data-protection obligations that grow with real users. Should be specified before the app handles anyone's data but the author's. |
