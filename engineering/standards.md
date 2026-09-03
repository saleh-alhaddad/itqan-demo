# Standards — how this codebase is written

Stack:           Next.js (App Router, TypeScript) · PostgreSQL · Prisma ORM · React UI.
                 Single repo, single deploy; API surface is Next.js route handlers /
                 server actions, not a separate service.  · user-stated · 2026-09-03
Test tooling:    not yet established — follows from the stack choice.  · detected · 2026-09-03
Conventions:     none detected (no source files). To be established with the stack.
                 · detected · 2026-09-03
Branch format:   task/NNNN-<slug> — suite default, adopted because the repo has no
                 existing convention to follow.  · inferred · 2026-09-03
Commit format:   conventional commits — suite default for a greenfield repo; no CI to
                 check against yet.  · inferred · 2026-09-03
Copy source:     hardcoded-OK — the MVP is English-only, so user-facing strings may be
                 written in place. Revisit before adding any locale.  · user-stated · 2026-09-03

Domain terms:    (settled in 0001 DEFINE intake · user-stated/inferred · 2026-09-03)
  Team           — the unit of ownership and access. Owns boards. Has members with roles.
                   A single-person workspace is a Team with one member, not a special case.
  Membership     — the join between a User and a Team, carrying the role. Its EXISTENCE is
                   the authorization primitive: every access check is a membership lookup.
  Owner / Member — the only two roles. Owner: rename/delete team, manage members, delete
                   boards. Member: everything else. A team always keeps at least one owner.
  Board          — a workspace of columns belonging to exactly ONE team. Code: `Board`.
  Column         — an ordered, user-defined list on a board. A task's column IS its status;
                   there is no separate status concept anywhere in this project.
  Task           — a unit of work in exactly one column. Code: `Task` (never "card" in
                   code — "card" is UI vocabulary for the same thing).
  Assignee       — a team member attached to a task. Zero or more per task. Always
                   constrained to members of the owning team.
  Due date       — an optional plain calendar DATE on a task. Never a timestamp, so it
                   means the same day for every viewer.
  Overdue        — due date strictly before the viewer's today.
  Due-soon       — due within 2 calendar days of the viewer's today, and not overdue.
  Starter board  — the board auto-created during signup provisioning, with three default
                   columns. Those columns are ordinary editable columns, not a fixed set.
