# Release decision — 0001 · Task management app · 2026-09-04

Commit under consideration: `ed741c4` · branch `task/0001-task-management-mvp` · 36 commits
ahead of `main` (`d4da6a1`).

## Pre-launch checklist — evidence, not assertion

| # | Item | Result |
|---|---|---|
| 1 | `verify` green **now** | ✅ lint 0 · **210** unit+integration · build 0, re-run at this commit |
| 2 | `inspect` — no unresolved Critical/High | ✅ 0 findings; 3 Critical + 2 High found and closed in one round |
| 3 | `harden` — required here (auth + PII) and no open Critical | ✅ 0 findings at any severity; 1 Critical + 1 High + 4 Medium + 4 Info all closed |
| 4 | CI green on the exact commit | ⚠️ **No pipeline exists.** These tests have only ever run on one developer machine |
| 5 | All changes committed | ✅ clean tree at `ed741c4` |
| 6 | Config/secrets/migrations ready for the target environment | ❌ **There is no target environment.** No deploy config of any kind |
| 7 | Data migrations backward-compatible (expand → backfill → contract) | ✅ both are expand-only: 24 `CREATE`, **0 destructive statements** |
| 8 | Observability answers "is it working?" after launch | ❌ **Absent.** No logging, metrics, error tracking or alerting. A `/api/health` probe is the entire signal surface |

**Four items short of a production deployment; two of them are hard failures.**

## Decision

### Integration — **GO**
Merging `task/0001-task-management-mvp` into `main`. Every gate that governs whether the
*code* is fit is green, with evidence recorded at each one: `verify` found and fixed 3
defects, `harden` found and fixed 6, `inspect` found and fixed 7. A change sitting on its
task branch is not shipped (§11), and nothing about the code blocks this step.

### Production deployment — **NO-GO**
Not because of the code. Because the apparatus to run it safely does not exist yet:

1. **No observability.** After a deploy, nobody could answer "is it working?" There are no
   error rates, no latency signals, no alerting, and no error tracker. The release checklist
   requires "the key signals and an alert on the symptom that matters" — there are none.
   Deploying software you cannot watch is how a silent outage becomes a long one.
2. **No schema rollback path.** Prisma generates no `down.sql`, and `migrate reset` **drops
   all data**. Both migrations are expand-only, so a *code* rollback is safe today — but the
   first migration that changes an existing column will have no way back. This was raised in
   `verify` and is still open.
3. **No CI.** The suite has only ever run on one machine. Nothing would catch a regression
   that machine happens not to reproduce — and this run alone found three intermittent
   failures that a single local run had passed.
4. **No deployment target.** `spec.md` states plainly: *"No deployment target is assumed."*
   Polling was chosen partly to keep a serverless host viable, but nothing has been chosen.

None of these is a defect in the change. All four are absences that must be closed before
the first real user depends on this.

## Rollback plan — written before anything moved

**For the integration step (available today):**

| | |
|---|---|
| **Trigger** | `main` fails `pnpm lint`, `pnpm test`, `pnpm test:e2e` or `pnpm build` after the merge |
| **Action** | `git revert -m 1 <merge-commit>` — restores `main` to `d4da6a1` behaviour in one commit |
| **Data** | None at risk. No environment runs these migrations, so nothing to reverse |
| **Verify the rollback** | Re-run all four proving commands on `main`; expect the pre-merge state |
| **Time to restore** | One commit; under a minute |

**For a future production deploy (not exercised — recorded so it is not invented under pressure):**

| | |
|---|---|
| **Trigger** | Error rate above baseline, failed logins spiking, or the board endpoint's p95 above 500 ms — *none of which is currently measurable, which is blocker #1* |
| **Code** | Redeploy the previous image/commit |
| **Schema** | **No path today.** Both current migrations are additive, so old code runs against the new schema unharmed — that is the only reason a code-only rollback is safe. It stops being true at the first non-additive migration |
| **Prerequisite** | A verified backup/PITR restore, actually exercised rather than assumed |

## Rollout

**Single step**, and the staged plan collapses (§7): there is no user-facing environment to
stage into, no traffic to percentage-split, and no flag system. The rollback note is still
written above, which is the part that survives the collapse.

When a target environment does exist, this change is user-facing and should be staged —
off → internal → 25% → 50% → 100% — with named thresholds, which requires blocker #1 first.

## Non-functional criteria

| Criterion | Result |
|---|---|
| SC10 freshness (≤ 2 poll intervals) | ✅ proven end-to-end across two browser contexts |
| Board query performance | ✅ measured: p50 **4.4 ms**, 4 SQL statements, 122 KB payload at 360 tasks |
| Accessibility | ✅ every control named, board completable by keyboard alone, contrast asserted against the painted pixel |
| Localization | n/a — English only, an explicit exclusion |

---

## Outcome — what actually happened

### Integration executed
`git merge --no-ff task/0001-task-management-mvp` → merge commit **`23c9eb3`** on `main`.
Re-verified **on `main` after the merge**, not before it — the merge itself is a change, and
a task branch proving green says nothing about the branch it landed on:

| Check on `main` @ `23c9eb3` | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm test` | **210 passed** |
| `pnpm build` | exit 0 |
| `pnpm test:e2e` | **72 passed** |

**Rollback command, live from this moment:** `git revert -m 1 23c9eb3` (`-m 1` selects the
first parent — `main` before the merge — which is what makes a merge commit revertible at all).

### Blocker #3 closed — CI
Branch `chore/ci-pipeline`, `.github/workflows/ci.yml`. Runs on every push to `main` and every
pull request against a `postgres:18-alpine` service pinned to the local major version:

- `pnpm install --frozen-lockfile` — CI builds what the lockfile says, not a fresh resolution
- `prisma migrate deploy` + `generate`, then a **schema-drift check** (`migrate diff
  --from-migrations … --exit-code`), which is the one check with no local equivalent: a
  `schema.prisma` edited without a matching migration passes every test and breaks the next deploy
- `pnpm lint` → `pnpm test` under **UTC, America/Los_Angeles and Asia/Tokyo** → `pnpm build`
  → `pnpm test:e2e`
- Playwright report uploaded on failure, so a red run is diagnosable without reproducing it

Node pinned to **24 LTS**, not the local 25: Prisma 7 prints an unsupported-version banner on
25, and a warning nobody can silence eventually hides a real one.

The drift command was **run locally in the exact CI form** before being committed (exit 0, "No
difference detected") rather than trusted to be correct in YAML.

**Observed green — blocker #3 is closed in fact, not in code.** Run
[`33915685839`](https://github.com/saleh-alhaddad/itqan-demo/actions/runs/33915685839),
conclusion **`success`** in 3m29s on `c8809e2`, triggered by the pull_request event on
[PR #1](https://github.com/saleh-alhaddad/itqan-demo/pull/1):

| Step | Result on a machine that is not the developer's |
|---|---|
| Schema drift | `No difference detected` |
| `pnpm lint` | pass |
| `pnpm test` — UTC / America/Los_Angeles / Asia/Tokyo | **210 / 210 / 210 passed** |
| `pnpm build` | `Compiled successfully in 6.2s` |
| `pnpm test:e2e` | **72 passed** (1.4m) |

Every step succeeded. The one skipped step is the report upload, which is `if: failure()` — a
skipped artifact upload is what a passing run is supposed to look like.

This is the first time any of these counts has been reproduced off the developer's laptop,
which was the entire content of the blocker.

PR #1 merged as `0963767` with a **merge commit, not a squash**: the release checklist requires
that the artifact promoted is the one CI tested, and a squash would have minted a new SHA no
run had ever seen. `git merge-base --is-ancestor c8809e2 main` confirms the tested commit is in
`main`'s history.

Both triggers are proven, not just the one: run
[`33916701161`](https://github.com/saleh-alhaddad/itqan-demo/actions/runs/33916701161) also
concluded **`success`**, fired by the **push** event on `main` at merge commit `0963767`. The
pull_request path was proven by #1; the push path by the merge itself.

**Checklist item 4 is now satisfiable** for a future deploy — CI can be green on the exact
commit being shipped, because CI exists and runs on every push to `main` and every PR.

*Method note:* the first success signal was discarded rather than trusted. `gh run watch
--exit-status | tail` returns **tail's** exit code, not `gh`'s, so it reports 0 for a red run
too. The conclusion above was read back from the API instead — the same failure mode as a
mutation test that never applied.

### Blockers still open — unchanged and deliberate

| # | Blocker | Status |
|---|---|---|
| 1 | No observability | **Open.** Nobody could answer "is it working?" after a deploy |
| 2 | No schema rollback path | **Open.** Safe today only because both migrations are additive |
| 3 | No CI | ✅ **CLOSED** — run `33915685839` green; CI runs on every push to `main` and every PR |
| 4 | No deployment target | **Open.** `spec.md`: "No deployment target is assumed" |

The production **NO-GO stands.** Three of four blockers remain, and #1 and #2 are the two that
turn a bad deploy into a long outage rather than a short one. Closing #3 removed the weakest of
the four — it made the evidence reproducible, not the system operable.
