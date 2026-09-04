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
