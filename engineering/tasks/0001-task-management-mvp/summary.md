# Summary — 0001 · Task management app (teams, boards, due dates)

Status at close: **BLUEPRINT complete, awaiting the approval gate.**
`define` ✓ approved · `design` ✓ · `blueprint` ✓ written, `approved:false`.
No code exists. `construct` must not start until the gate is answered.

## What this run did (2026-09-04)

1. **Resume sweep.** Re-proved every prior phase rather than trusting the ledger.
   All artifacts present and non-empty; `state.json` parses; `index.md` agrees with it.
   Re-ran `git check-ignore -v engineering/profile.md` → exit 1: a `.gitignore` appeared
   since the profile was written, and the committed exposure still holds.
2. **Resolved the blocking open item — git isolation.** `main` now carries baseline commit
   `d4da6a1`; branch `task/0001-task-management-mvp` created off it.
3. **Dependency reality check against the live npm registry** (not from memory).
   Findings are recorded in `plan.md` § "Step 1b" with the command that produced each.
4. **Wrote `plan.md`** — 18 dependency-ordered vertical slices, risk-first.
5. **Fresh-eyes pass** read from the file alone; fixed 3 defects before presenting.

## The findings that changed the plan

- **`prisma` CLI `latest` is `8.0.0-rc.12`; `@prisma/client` `latest` is `7.10.0`.** A bare
  install pairs an RC CLI with a stable client. T01 pins both to `7.10.0`.
- **Prisma 7 is ESM-only** (`"type": "module"`) and its `prisma-client` generator needs an
  explicit output path — a T01 acceptance criterion, not a footnote.
- **Prisma 7 + Next 16 + Turbopack has a known bundling break.** T01 is therefore a walking
  skeleton that must survive a *production build*, with three escape hatches named in advance.
- **Next 16 removed synchronous `params`/`cookies()`** — non-awaited access compiles cleanly
  while being broken, so it is stated once for every task.
- **`react-beautiful-dnd`, `lucia`, and `shadcn-ui` are all registry-deprecated.** Excluded.
- **Both live drag-and-drop libraries are stale** (last published 2024-12 / 2025-02).
  Mitigated structurally: T10 builds the explicit move control *before* any drag library, so
  the app is fully usable if the library has to be dropped.

## Decisions this plan settles

- **D1 — I5 ordering** (the spec deferred this to blueprint): dense integers rewritten in one
  transaction, with **no** `unique(parentId, position)` constraint — density is asserted by
  test instead. Sparse/fractional keys recorded as the rejected alternative, with a revisit
  trigger.
- **D2 — one authorization funnel.** Guards *return the fetched resource*, so a handler
  cannot obtain a board without passing the check. T06 builds it before any board endpoint.
- **D3 — one `notFound()`**, because SC5 asserts byte-identity and two hand-written 404
  bodies eventually differ.

## What the next session must pick up

- **The gate is unanswered.** `plan.md` is on disk with `approved:false`. A resumed run
  re-presents it; it does not build from it.
- **Two Shape choices are deliberately unmade**, each with a recommendation:
  **T03 session storage** — stateless sealed cookie vs DB-backed session table
  (*recommended: DB-backed*; a sealed cookie cannot revoke on logout, which `harden` will
  raise anyway). **T10 drag library** — `@dnd-kit` vs `@hello-pangea/dnd`
  (*recommended: `@hello-pangea/dnd`*, the only one declaring React 19 support).
- **`harden` remains scheduled, not optional** — self-hosted credentials plus SC7's
  enumeration oracle.
- **Nothing is committed.** The branch exists; `plan.md` and the ledger updates are
  uncommitted. The first commit is the user's call (§12).
