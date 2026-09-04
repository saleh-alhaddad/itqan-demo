# Summary — 0001 · Task management app (teams, boards, due dates)

Status at close: **CONSTRUCT COMPLETE — all 19 plan slices done.**
`define` ✓ approved · `design` ✓ (revised from the reference) · `blueprint` ✓ approved (v2) ·
`construct` ✓ done. **`verify`, `harden`, `inspect` and `release` have NOT run.**

## Proven at close, not recalled

| Check | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm test` | **171 passed** — also green under UTC, America/Los_Angeles, Asia/Tokyo |
| `pnpm test:e2e` | **57 passed** |
| `pnpm build` | exit 0 |
| Schema drift | none (`migrate diff` exit 0) |
| Working tree | clean |

All 11 success criteria and all 7 invariants carry test references. Roughly 45 mutants were
introduced across the run and every one was killed — after correcting three that turned out
not to have applied at all, which is its own lesson.

## What exists

Signup provisions a usable board atomically. Boards carry user-defined columns; tasks can be
created, edited, moved by keyboard or drag, assigned, dated and discussed. Teams add and
remove members by email with a last-owner guard. Everything cascades on delete, and an open
board re-fetches every ten seconds.

## The decisions that shaped it

1. **A board belongs to exactly one team**, so every authorization check is a membership lookup.
2. **A task\'s column IS its status** — one representation, nothing to drift.
3. **Authorization lives in the query**, never in a layout. Learned the hard way: a layout
   check let a page serialise another team\'s board into a 404\'s RSC payload.
4. **Dense ordering with no unique constraint**, guaranteed by one funnel plus tests.
5. **Polling, not push**, with staleness stated as a product property.
6. **Hard delete only**, with every cascade named in its confirmation.
7. **The design reference contributed a visual language and no features** — all ten of its
   extra capabilities were declined and recorded in `spec.md`.

## What the next session must do

- **`verify` has not run.** Construct proves each slice; verify exercises the whole thing.
- **`harden` is scheduled and NOT optional** — self-hosted credentials, SC7\'s deliberate
  enumeration oracle, argon2 cost parameters left at defaults, and the login rate
  limiting/lockout the spec explicitly deferred to it.
- **Then `inspect`, then `release`** (GO/NO-GO gate).
- **No password reset exists.** The largest accepted MVP risk, taken knowingly at the spec gate.
- **CI should pin Node 24 LTS**; Prisma 7 warns on the local Node 25 (verified non-fatal).
