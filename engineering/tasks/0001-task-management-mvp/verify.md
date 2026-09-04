# Verify — 0001 · Task management app

Date: 2026-09-04 · Branch `task/0001-task-management-mvp` · Commit at start: `83a15d6`

**Verdict: PASS**, after finding and fixing three defects. Every claim below was produced by
running the command now and reading its output, not recalled from the build.

## Part A — the proving set (fresh, in full)

| Command | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm test` | **178 passed** — also green under `TZ=America/Los_Angeles` and `TZ=Asia/Tokyo` |
| `pnpm test:e2e` | **61 passed**, no retries and no flakes |
| `pnpm build` | exit 0 |

## Part A — database pack

**Migration up**, against a genuinely empty database (`itqan_verify`):
`prisma migrate deploy` → **0.77s**, 10 tables, 26 DDL statements. The 10 `ALTER TABLE`s add
foreign keys to empty tables, so no exclusive lock is held on real data.

**Migration down: no rollback path exists.** Prisma generates no `down.sql`; the only reverse
is `migrate reset`, which drops everything. For migration #1 that is harmless — rolling it
back means an empty database, which is where it started. **From migration #2 onward it is
not**, and `release` needs a schema rollback plan, not just a code one. Logged as a finding.

**Prod-shaped volume** — 10 users, 5 boards, 480 tasks, 960 assignments, 1440 comments,
with one deliberately busy board of 6 columns × 60 tasks. Source: derived from `spec.md`'s
stated audience ("a small group"), taken at the pessimistic end; no production data exists.

Measuring the endpoint the 10-second poll re-fetches, on the 360-task board:

| | |
|---|---|
| p50 / p95 / max | **4.4ms / 6.5ms / 7.9ms** |
| SQL statements per load | **4** — no N+1; Prisma batches the nested relations |
| Payload | **151.3 KB → 122.3 KB** after the PII fix below |

## Part A — browser gates

- **Console clean:** the whole core flow — signup, add column, add task, edit, assign,
  comment, move, and every navigation — runs with **zero console errors and zero warnings**.
- **Accessibility from the tree, not the pixels:** every interactive control on the board has
  a role and an accessible name. The probe asserts it examined >8 controls first, because an
  empty set produces no unnamed elements and would pass while proving nothing.
- **Keyboard completable:** tab order reaches the add-task control without ever losing focus,
  and the control reached by keyboard works by keyboard.
- **Screenshot evidence:** `evidence/verify-board.png`.

## Part A — independent pass (18 adversarial probes)

Written from `spec.md`'s criteria against a live server, deliberately trying to break it:
oversized input, unicode/RTL/emoji/combining marks, null bytes, malformed bodies, missing
content-type, `MAX_SAFE_INTEGER` and negative positions, SQL payloads, tampered session
tokens, 500 bogus assignee ids, comment size boundaries, and four concurrency races.

**First run: 16/18.** After the fixes: **18/18, three consecutive runs, zero server-side
errors** (`evidence/adversarial-probes.mjs`).

## Part B — three defects, root-caused before any fix

### 1. A null byte in any text field returned 500 (P2039)
- **Symptom:** `POST /api/columns/:id/tasks` with U+0000 in the title → 500.
- **Root cause:** Postgres `text` cannot hold U+0000 (`invalid byte sequence for encoding
  "UTF8": 0x00`). The validation boundary accepted a character the storage layer cannot
  represent — zod checked the string's shape, not its storability.
- **Fix:** `lib/api/validation.ts` — one `storableText` / `requiredText` rule, applied to all
  **9** route files carrying user text. Rejected with 400 rather than stripped: a null byte
  is never something a person meant to type, and silently rewriting input is worse than
  refusing it.

### 2. Concurrent removal of the same member returned 500 (P2025)
- **Symptom:** two simultaneous `DELETE .../members/:id` → one 500.
- **Root cause:** the handler read the membership, then deleted it. A concurrent request
  committed its delete in between, so `delete` threw "record not found".
- **Fix:** `deleteMany` (idempotent), plus P2034 → 409. Removing someone already removed is
  the desired state, not an error.

### 3. Concurrent task moves returned 500 (P2034) — the most consequential
- **Symptom:** several people moving cards in one column at once → a 500 for one of them.
- **Root cause:** `reorderWithin` reads a column's order then rewrites the affected run.
  Two of those overlap and Postgres aborts one with a write conflict. **The abort is
  correct** — no partial state, the dense invariant holds — but it is *transient*, and it
  reached the caller as a 500 instead of being retried.
- **Why it matters most:** two people dragging cards on the same board at once is this
  product's core collaborative action. It is the likeliest concurrent path in the app.
- **Fix:** `retryOnWriteConflict` — bounded to 3 attempts, only P2034, with randomised
  backoff so racing callers do not collide again in lockstep. Any other error propagates
  untouched, because retrying a genuine failure hides it.
- **Pinned first:** the repro failed 2 of 3 runs before the fix and 3 of 4 with the fix
  disabled again; it passes 5 of 5 with the retry in place.

## Findings carried forward (not defects — for release/harden)

1. **No schema rollback path.** Fine for migration #1; needs a plan before the second.
2. **The polled payload is 122 KB on a 360-task board.** Well within MVP tolerance at
   4.4ms p50, and `spec.md` already names the mitigation (a changed-since check) if poll
   volume becomes a problem. Recorded as the number to watch, with a measurement to compare
   against rather than a guess.
3. **`itqan_verify`** holds the volume fixture, so the measurement can be repeated.
