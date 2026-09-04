# Summary — 0001 · Task management app (teams, boards, due dates)

**Status: SHIPPED TO `main`.** Merge commit `23c9eb3`, 37 commits.
`define` ✓ · `design` ✓ · `blueprint` ✓ · `construct` ✓ · `verify` ✓ · `harden` ✓ ·
`inspect` ✓ · `release` ✓ — all eight phases done and validated.

**Production deployment is NO-GO and that is deliberate.** Not one gate on the *code* is
open, and CI is green. Three of four *apparatus* blockers are — see "What is not done" below. Read that
section before deploying anything.

## Outcome

**No outcome data exists, and none is claimed.** §19 asks that success criteria be read back
with real data after the rollout bakes. There has been no rollout: no environment, no users,
no traffic. Every number in this document is a *test* result or a *local measurement*. The
code demonstrably works; whether the product works is unmeasured and unmeasurable today.

All 11 success criteria and all 7 invariants carry test references — that is proof of
implementation, not proof of value.

## Proven on `main` after the merge, not recalled

Re-run *after* `23c9eb3`, because a task branch proving green says nothing about the branch it
lands on:

| Check | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm test` | **210 passed** — also green under UTC, America/Los_Angeles, Asia/Tokyo |
| `pnpm test:e2e` | **72 passed** |
| `pnpm build` | exit 0 |
| Schema drift | none (`prisma migrate diff --exit-code`) |

**And independently reproduced in CI**, which is the part that matters — until run
[`33915685839`](https://github.com/saleh-alhaddad/itqan-demo/actions/runs/33915685839)
(`success`, 3m29s, commit `c8809e2`) these numbers had only ever come from one laptop. CI
returned **210 / 210 / 210** unit+integration under UTC / America/Los_Angeles / Asia/Tokyo,
**72** e2e, a clean drift check and a clean build.

Scale: 16 API routes · 6 pages · 26 test files · 16 e2e specs · 2 migrations (both additive).

## How to run it

```bash
pnpm install
# .env needs DATABASE_URL and SHADOW_DATABASE_URL (the latter is used only by the drift check)
pnpm exec prisma migrate deploy && pnpm exec prisma generate
pnpm dev            # localhost:3000
pnpm test           # vitest — unit + integration
pnpm test:e2e       # playwright, binds E2E_PORT (3100)
```

Postgres 18 local. Node **24 LTS** — Prisma 7 prints an unsupported-version banner on Node 25
(non-fatal, but CI pins 24 so the banner can never mask a real warning).

## The code that carries the weight

Read these four before changing anything; the rest of the codebase leans on them.

| File | Why it matters |
|---|---|
| `src/lib/ordering.ts` | **Every `position` write goes through here.** Each takes a `pg_advisory_xact_lock` on its parent inside one transaction. A transaction alone was not enough — two callers writing *different* rows never conflict, so Postgres had nothing to serialise on |
| `src/lib/auth/guard.ts` | Every authorization check. Refusals all collapse to one shared `NOT_FOUND` so the API never distinguishes "absent" from "not yours" |
| `src/lib/api/errors.ts` | `handleErrors(request, fn)` — `request` is a **required** argument specifically so the CSRF origin check cannot be forgotten by a new route. The type system enforces the security property |
| `src/lib/client/mutate.ts` | The single path for client mutations. Checks `res.ok` and toasts the server's message — before this, a refused action failed silently and the UI showed it as succeeded |

Also: `src/lib/boards.ts` (membership predicate **inside** the query), `src/lib/auth/session.ts`
(30-day rolling + 90-day absolute cap, plus sign-out-everywhere), `src/lib/auth/throttle.ts`
(cooldown, not lockout — a lockout is a DoS), `src/lib/dates.ts` (due dates read in UTC,
"today" read locally — two separate functions, deliberately not one heuristic).

## The decisions that shaped it

1. **A board belongs to exactly one team**, so every authorization check is a membership lookup.
2. **A task's column IS its status** — one representation, nothing to drift.
3. **Authorization lives in the query**, never in a layout. Learned the hard way: a layout
   check let a page serialise another team's board into a 404's RSC payload.
4. **Dense ordering with no unique constraint**, guaranteed by one funnel plus tests.
5. **Polling, not push**, with staleness stated as a product property.
6. **Hard delete only**, with every cascade named in its confirmation.
7. **The design reference contributed a visual language and no features** — all ten of its
   extra capabilities were declined and recorded in `spec.md`.

## Operate — the runbook

There is no on-call surface yet, so this is mostly a list of what is missing. Recorded now so
it is not invented under pressure.

| | |
|---|---|
| **Dashboards / alerts** | **None exist.** This is blocker #1 |
| **CI** | `.github/workflows/ci.yml` on `main` — every push and PR. A red run uploads the Playwright report as an artifact |
| **Health probe** | `GET /api/health` — the entire signal surface today |
| **Rollback (code)** | `git revert -m 1 23c9eb3` · one commit · under a minute |
| **Rollback (schema)** | **No path.** Prisma emits no `down.sql`; `migrate reset` drops all data |
| **Rollback trigger** | Any of the four proving commands failing on `main` |
| **Known failure modes** | Concurrent moves (serialised by advisory lock — regression-tested); null bytes in text (rejected at validation); board payload grows with task count (122 KB at 360 tasks) |
| **Escalation** | Single-developer project; no rota |

## What is not done — read before deploying

| # | Blocker | Consequence if ignored |
|---|---|---|
| 1 | **No observability** | After a deploy nobody can answer "is it working?". The staged rollout in `release.md` has abort thresholds that are currently unmeasurable |
| 2 | **No schema rollback path** | Safe *today* only because every migration is additive. The first column change ends that, silently |
| 3 | ~~No CI~~ — **CLOSED** | Run [`33915685839`](https://github.com/saleh-alhaddad/itqan-demo/actions/runs/33915685839) concluded `success`. `ci.yml` is on `main` and fires on every push and PR. Nothing to do |
| 4 | **No deployment target** | `spec.md`: "No deployment target is assumed" |

Accepted risks, decided knowingly:

- **No password reset.** The largest MVP risk, taken at the spec gate. Sign-out-everywhere is
  the only self-service recovery.
- **CSP permits inline script**, so it is not XSS-proof. A per-request nonce needs a
  middleware layer this app does not have. Documented in `next.config.ts`.
- **All ten design-reference features declined** (B1–B10). Recorded in `spec.md` under
  "Declined from the design reference" so the decision has one home. Adopting any of them
  amends the spec, which is gated.

## The lesson worth carrying forward

Three separate times a **mutation test reported green because the mutation never applied** —
a `sed` that did not match, a `db push` that printed help, a stale path. Each time the natural
conclusion was "this test is weak". The real conclusion was "this test was never run against
the mutant". Every mutation from then on asserted the substitution landed *before* running the
suite. A test that cannot fail is indistinguishable from a test that passes, and the whole
value of the exercise is the difference between them.
