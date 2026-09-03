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
