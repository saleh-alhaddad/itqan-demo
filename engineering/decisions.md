# Decisions — durable, cross-task, with the reasoning

No existing ADR convention found in this repo (no docs/adr/ or equivalent), so this file
starts the scheme.

<!-- entries appended as decisions are settled -->

## A board belongs to exactly one team · 2026-09-03
Decision:     Boards are owned by exactly one team. Board access is derived purely from
              team membership. A "personal" board is a board in a one-member team.
Why:          It collapses authorization to a single rule with no branches — the check is
              always "is the actor a member of this board's team?". The alternatives each
              introduce a second ownership path, and a second path is where authorization
              bugs live: every future endpoint must remember to handle both, and the one
              that forgets is a data leak rather than a visible failure.
Alternatives: Team-or-user ownership via a nullable owner column (rejected: two branches
              in every check, forever). Boards shared across several teams (rejected:
              replaces membership with a full access-grant table and per-board sharing UI,
              well past MVP).
Status:       accepted

## A task's column IS its status · 2026-09-03
Decision:     Columns are user-defined per board and a task's column is its status. No
              separate status field exists on the task.
Why:          Two representations of "where is this task" will drift apart — not might.
              With one representation there is nothing to reconcile, no sync code, and no
              class of bug where the card is in Done but reports as In Progress.
Alternatives: Fixed To Do/Doing/Done columns (rejected: users adapt boards to their
              workflow immediately, and a fixed set makes that impossible). Custom columns
              plus an independent status enum (rejected: exactly the drift described above,
              bought for reporting the MVP does not do).
Status:       accepted

## Near-real-time by polling, not push · 2026-09-03
Decision:     Open boards re-fetch every 10 seconds while focused. No websockets, no SSE,
              no presence.
Why:          The user asked for live updates while setting a lean-MVP ambition; those
              conflict, because push is infrastructure (persistent transport, fan-out,
              reconnection) rather than a feature. Polling delivers most of the perceived
              value for a fraction of the cost, keeps serverless hosting viable, and fails
              gracefully. Up to 10s of staleness is an accepted product property.
Alternatives: True push via SSE/websockets (deferred, not rejected — revisit if
              simultaneous editing becomes common). No freshness at all (rejected: the
              user explicitly wanted live updates).
Status:       accepted
Revisit when: concurrent editing of one board becomes routine, or poll volume shows up in
              database load.

## Hard delete only — no soft delete · 2026-09-03
Decision:     Deletes remove rows and cascade down the ownership chain. No deletedAt
              column anywhere. Destructive actions require UI confirmation.
Why:          Soft delete taxes every query in the application forever — one forgotten
              predicate and deleted data reappears, which is a worse failure than the
              deletion being permanent. Confirmation dialogs address the real risk
              (mis-clicks) at the point where it happens.
Alternatives: Soft delete with an archive view (rejected for the MVP: a global query
              obligation plus unique-constraint complications, bought for recovery from a
              mistake that confirmation already prevents).
Status:       accepted
Revisit when: real users report data loss — the fix is a migration plus a predicate audit,
              and knowing that cost in advance is why this was declined rather than missed.

## No email infrastructure in the MVP · 2026-09-03
Decision:     The MVP sends no mail. Consequently there is no password reset, no email
              verification, and no invitations to people without an account — members are
              added by looking up an existing account by email address.
Why:          A transactional email provider is a dependency, a cost, and a deliverability
              problem; the MVP can demonstrate its value without one.
Alternatives: Add a provider now (rejected for the MVP — but note it unlocks reset,
              verification, and true invitations together, so it is one dependency for
              three features and is the obvious first post-MVP addition).
Status:       accepted
Known cost:   A forgotten password is unrecoverable. This is the largest product risk in
              the MVP and is recorded as such in the spec — accepted knowingly, not missed.

## Authorization lives in the query, never in a layout · 2026-09-04
Decision:     Every read of team-scoped data is fetched by a function that takes the ACTOR
              and embeds the membership predicate in the query itself (`loadBoardFor(userId,
              boardId)`, and the `require*Access` guards). A route layout may repeat the
              check, but it is never the boundary.
Why:          Found the hard way in T07. The board page checked access in
              `app/(app)/boards/[boardId]/layout.tsx` and then loaded the board unscoped in
              the page. **Next renders a layout and its page concurrently.** The layout threw
              `notFound()` and the response carried a correct 404 status — while the page had
              already queried the board and serialised it into the RSC flight payload. A
              signed-in stranger received a 404 containing another team's board name, column
              names, ids, and task titles.
              The status code was right the whole time. Only an assertion on the response
              BODY exposed it, which is why `e2e/board.spec.ts` asserts absence of the
              victim's strings rather than just `status === 404`.
Alternatives: Layout-level guards (rejected — demonstrably unsound in the App Router, and
              unsound in a way that looks correct in a browser). Middleware-level guards
              (rejected for this: the check needs a database lookup, and middleware would
              duplicate the ownership rules it cannot see).
Consequence:  A page or handler CANNOT obtain team-scoped data without passing the actor.
              This is the read-side of the guards-return-the-resource rule: the only way to
              get the data is through the check, so a new call site cannot forget it.
Status:       accepted
Guarded by:   `e2e/board.spec.ts` "a stranger's 404 contains none of the board's data",
              mutation-checked — reverting the query to unscoped turns it red.

## Transient write conflicts are retried, not surfaced · 2026-09-04
Decision:     A Prisma P2034 (TransactionWriteConflict) inside the ordering funnel is retried
              up to 3 times with randomised backoff. Only P2034; every other error propagates.
Why:          Reordering reads a column's order and rewrites the affected run, so two
              concurrent reorders on one column overlap and Postgres aborts one. The abort is
              the database doing its job — it leaves no partial state and the dense-position
              invariant holds — but it is transient, and it was reaching the client as a 500.
              Two people dragging cards on the same board simultaneously is precisely what
              this product is for, which makes it the likeliest concurrent path in the app.
Alternatives: Return 409 and let the client retry (rejected for a drag: the user sees a card
              snap back for a reason that is not their problem). Serializable isolation with
              application-level locking (rejected: far more machinery for a conflict that
              resolves by simply trying again). Sparse/fractional ordering keys, which avoid
              the conflict entirely (deferred — that is D1's recorded revisit trigger).
Bounded:      3 attempts, P2034 only. Retrying a genuine failure would hide it.
Status:       accepted
Guarded by:   tests/integration/task-move.test.ts concurrency regressions — verified by
              disabling the retry, which turns them red in 3 of 4 runs.

## Auth throttling is a cooldown, not a lockout · 2026-09-04
Decision:     Failed logins push the *next permitted attempt* further out, exponentially
              (3 free attempts, then 1s/2s/4s… capped at 5 minutes), counted against BOTH the
              email address and the client IP. Counters live in a database table. No account
              is ever locked.
Why:          harden C1 measured ~138 login attempts per second from one client with no
              throttle and no lockout — credential stuffing with nothing in its way, made
              worse because there is no password reset, so a stolen account is unrecoverable.
              A hard lockout would have been the obvious fix and the wrong one: locking an
              account after N failures hands an attacker a denial-of-service against any user
              whose address they know. A cooldown costs a person who mistypes their password
              about a second, and costs an attacker everything.
              The counters are in Postgres rather than in memory because an in-process counter
              resets on restart and is not shared between instances — worthless on the
              serverless hosting the polling decision deliberately kept viable. Same reasoning
              that put sessions in the database.
              Both buckets are needed: an email-only counter is escaped by spraying many
              addresses, an IP-only counter by distributing one address across hosts.
Fails open:   A database error skips the throttle rather than refusing the request. A control
              that cannot read its counters must not become an outage of the login page.
              Narrow and deliberate — the exposure lasts only as long as the database problem.
Alternatives: Hard lockout after N failures (rejected: DoS on the real owner). CAPTCHA
              (rejected for the MVP: a third-party dependency, and the spec avoids those).
              In-memory limiter (rejected: useless across instances and restarts).
Status:       accepted
Guarded by:   tests/unit/throttle.test.ts (the policy numbers) and
              tests/integration/auth-throttle.test.ts (both buckets, the 429, Retry-After,
              reset-on-success, and that the cooldown is bounded).

## Signup keeps its "already registered" message · 2026-09-04
Decision:     `POST /api/auth/signup` continues to answer 409 for an existing address. The
              enumeration this permits is mitigated by throttling the surface, not by removing
              the message.
Why:          The alternatives are worse. Returning 201 always and mailing the real owner is
              the standard fix and is unavailable — the MVP ships no email. Returning a vague
              error leaves a person who genuinely has an account unable to work out why signup
              fails, with no password reset to fall back on. Throttling makes probing an
              address list impractical while a real person on their first attempt still gets a
              straight answer.
Consequence:  A determined attacker can still confirm a handful of addresses slowly. Accepted
              knowingly: the spec already accepts the same trade at SC7 for member lookup.
Status:       accepted
Revisit when: an email provider is added — that unlocks the standard fix for this, password
              reset, and true invitations together.

## Sessions have an absolute cap as well as a rolling one · 2026-09-04
Decision:     A session expires 30 days after its last use (rolling) OR 90 days after it was
              created (absolute, never refreshed), whichever comes first. "Sign out
              everywhere" deletes every Session row for the user.
Why:          The rolling window alone meant a session that was merely used stayed valid
              forever, so a stolen cookie never expired on its own — and with no password
              reset in this MVP, its owner had no way to revoke it either. The absolute cap
              puts a ceiling on how long any single credential can live regardless of
              activity, and sign-out-everywhere gives the owner a recovery path.
              This is the payoff for having chosen DB-backed sessions over a sealed cookie
              (Q19): with a stateless cookie, revoking one user's sessions would mean
              rotating a signing key for everybody.
Also fixed:   There was no way to sign out at all — the endpoint existed and no UI called it.
Status:       accepted

## The cross-origin check is structural, not remembered · 2026-09-04
Decision:     `handleErrors` takes the Request as a REQUIRED argument and performs the
              same-origin check for every non-GET. The three auth routes, which do not use
              the wrapper, call `assertSameOrigin` explicitly, and a test enumerates the
              route files and fails if a mutating handler is covered by neither.
Why:          SameSite=Lax already stops the browser attaching the session cookie to a
              cross-site POST, so this is a second layer. It matters because SameSite is a
              single point of failure: changing the cookie to SameSite=None for an embed or
              an integration would open every mutation at once, silently.
              Making the request a required argument is the same idea as guards that return
              the resource — a new route cannot compile without passing it, so the check
              cannot be forgotten rather than merely being documented.
Deliberate:   A request with neither Origin nor Referer is ALLOWED. Browsers always send
              Origin on cross-origin state-changing requests, so refusing header-less
              requests would break curl, server-side callers and the test suite without
              stopping the attack.
Status:       accepted

## Ordering is serialised with a per-parent advisory lock · 2026-09-04
Decision:     Every write to `position` happens inside `lib/ordering.ts`, in a transaction
              that first takes `pg_advisory_xact_lock` on the parent board or column. Two
              scopes are locked in sorted key order. `appendPosition` returns `max + 1`.
Why:          D1 chose dense integers with no unique constraint, which puts the entire
              guarantee in application code — and a review found that premise broken. Three
              concurrent moves produced positions `[0,0,0]`; five concurrent creates produced
              `[0,0,0,1,2]`. Two rows sharing a sort key have no defined order, so cards
              visibly swap between polls.
              A transaction alone does not fix this. Two callers can both read `max = 4` and
              both write `5` without ever conflicting, because they touch different rows and
              nothing serialises them. The advisory lock is what makes ordering work on one
              parent serial — the actual requirement behind dense integers.
              Sorted lock order matters: locking in call order lets a move A→B and a
              simultaneous B→A each hold one lock and wait for the other.
              `count()` was replaced with `max + 1` because the two agree only while a run is
              dense, so `count()` collided the instant a gap existed — it returned 3 for a
              column holding [0,1,3].
Alternatives: A unique constraint on (parent, position) — rejected by D1, and still rejected:
              dense shifts collide transiently. Sparse or fractional keys — the recorded
              revisit trigger for D1, and a larger change than this defect warranted.
Status:       accepted
Guarded by:   tests/integration/ordering-concurrency.test.ts — mutation-checked by removing
              the lock, which fails 3 of 7 on every run.

## Client mutations report their own failure · 2026-09-04
Decision:     Every client-side state change goes through `lib/client/mutate.ts`, which
              inspects the response, raises the server's `error.message` as a toast, and
              returns `ok` so the caller refreshes only on success.
Why:          Nine of eleven call sites fired a request and called `router.refresh()` without
              looking at the result, so a refusal repainted the old value and said nothing —
              the user's edit simply vanished. `design.md` already required the opposite; one
              component honoured it. Hardening made this materially worse by adding 429 and
              403 responses that real users will hit.
Notable:      A refused MOVE announces the failure rather than the move. Announcing a move
              that did not happen tells a screen-reader user the card is somewhere it is not,
              which is worse than saying nothing at all.
Status:       accepted

## "Shipped" and "deployed" are two separate decisions · 2026-09-04
Decision:     `release` for 0001 issued a SPLIT verdict rather than one: **integration GO**
              (merge to `main`, executed as `23c9eb3`) and **production deployment NO-GO**.
              Both were recorded, with the NO-GO's four blockers named individually.
Why:          Collapsing them forces a false choice. A single GO would have implied the app is
              deployable when no environment, observability or schema-rollback path exists; a
              single NO-GO would have stranded 37 proven commits on a task branch, where they
              are not shipped at all (§11) and rot against `main`.
              The distinction is that the *code* gates and the *apparatus* gates fail for
              unrelated reasons. `verify`, `harden` and `inspect` all closed at zero findings —
              nothing about the change blocks the merge. What blocks a deploy is the absence of
              things that were never part of building it: you cannot watch it, and you cannot
              un-migrate it.
Notable:      Write the rollback BEFORE the action, even for a one-step merge. `git revert
              -m 1 23c9eb3` was recorded before the merge ran; `-m 1` selects the first parent,
              which is the only thing that makes a merge commit revertible.
              Re-verify ON THE TARGET BRANCH after merging. A task branch proving green says
              nothing about the branch it lands on — the merge is itself a change.
Status:       accepted
Guarded by:   `tasks/0001-task-management-mvp/release.md` — checklist, both verdicts, both
              rollback plans, and the post-merge re-verification.

## A mutation that did not apply is not a passing test · 2026-09-04
Decision:     Every mutation test asserts the substitution actually landed in the file
              (`assert <mutant> in <source>`) BEFORE running the suite against it.
Why:          This failed silently three times across 0001 — a `sed` pattern that did not
              match, a `prisma db push --skip-generate` that printed help instead of running,
              and a stale file path. Each reported a green suite, and each time the obvious
              reading was "this test is too weak to catch the bug".
              The true reading was the opposite: the test was never run against the bug at all.
              The two outcomes are indistinguishable from the output alone, and they point in
              opposite directions — one says strengthen the test, the other says fix the
              harness. Roughly 60 mutants were used across the task; without this check, three
              of them would have quietly certified tests that had proven nothing.
Notable:      Generalises past mutation testing: any negative-result technique must first prove
              it actually perturbed the system. The same class of error made an a11y probe pass
              vacuously by returning `[]` for an empty element set — fixed by asserting
              `examined > 8` before asserting the property.
Status:       accepted
