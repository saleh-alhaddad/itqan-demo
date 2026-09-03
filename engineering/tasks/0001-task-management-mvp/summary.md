# Summary — 0001 · Task management app (teams, boards, due dates)

Status at close: **DEFINE complete and APPROVED at the gate on 2026-09-03.**
The run was explicitly halted after the spec gate by the original request, so no plan and
no code exist. Update the "Gate outcome" line below once the user answers.

Gate outcome: **APPROVED as written**, after the user was shown the no-password-reset risk
and the polling-vs-push resolution. Neither was overridden. Next phase: `blueprint`.

## What exists

| File | What it is |
|---|---|
| `engineering/profile.md` | How the suite operates here: committed in-repo workspace (git-verified), macOS/zsh, direct write access, single-agent, English. |
| `engineering/standards.md` | Next.js + Postgres + Prisma; branch `task/NNNN-<slug>`; conventional commits; the project's **domain terms**. |
| `engineering/decisions.md` | Five ADRs with reasoning: one-team board ownership · column-is-status · polling over push · hard delete · no email. |
| `tasks/0001-.../intake.md` | 16 recorded Q&As across a setup round and three define rounds. |
| `tasks/0001-.../spec.md` | The PRD: 11 provable success criteria, 7 invariants, the API contract, 20 explicit exclusions. |
| `tasks/0001-.../design.md` | Distilled UI intent: screens, four states each, interactions, tokens, accessibility. |

## The decisions that shape everything downstream

1. **A board belongs to exactly one team.** Every authorization check in the app reduces
   to a membership lookup. There is no second ownership path, by design.
2. **A task's column is its status.** One representation, so nothing can drift.
3. **Polling, not push.** Resolved a genuine conflict between the stated "lean MVP" and a
   real-time request. Up to 25s staleness is a stated product property.
4. **Hard delete.** No `deletedAt` anywhere, no global query predicate to forget.
5. **No email at all.** Which means **no password reset** — the largest accepted risk.

## What the next session must pick up

- **Git isolation is unresolved.** The repo has zero commits; `master` is an unborn ref, so
  there was nothing to branch from and nothing was branched. Establish a baseline commit on
  `main` *before* creating `task/0001-task-management-mvp`.
- **`harden` is scheduled, not optional** — self-hosted credentials, plus the enumeration
  oracle that SC7's helpful "no account with that email" message creates.
- **I5 (dense integer ordering) is deferred to `blueprint`** deliberately: the spec commits
  to stable explicit ordering, not to an encoding of it.
- Nothing has been committed. The workspace is untracked; the first commit is the user's call.
