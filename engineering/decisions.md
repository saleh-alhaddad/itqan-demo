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
