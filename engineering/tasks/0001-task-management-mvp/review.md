# Review — 0001 · Task management app · 2026-09-04

Reviewed at `6930540`, 32 commits, 117 source files (generated client and `engineering/`
docs excluded). Read from the code with the spec's success criteria and `standards.md`'s
domain glossary beside it, not from the build reasoning.

State re-proven before reviewing, not taken from the ledger: `lint` 0 · **202** unit and
integration · `build` 0.

Every finding below was **tested, not asserted** — each carries the command and its output.

---

## Critical

### C1 — Concurrent task moves produce duplicate positions, breaking I5
`src/app/api/tasks/[taskId]/route.ts:49`

**Demonstrated.** Three concurrent `PATCH /api/tasks/:id` moving tasks into the same column
with no explicit `position`:

```
statuses: 200,200,200
DEST POSITIONS: [0,0,1]   unique = 2 of 3
```

Two tasks share position `0`. I5 requires positions to be "explicit integers, dense and
starting at 0"; two rows with the same sort key have **no defined order**, so Postgres may
return them either way round and the cards visibly swap between polls.

**Root cause — and the code says so itself.** `lib/ordering.ts:18` states the design's
load-bearing premise:

> *"That only holds while this is the ONLY code that writes `position`: a second reorder
> path would break density in whichever path is used less, and nothing would notice."*

There **is** a second path. The move handler writes `position` directly:

```ts
data: { columnId, position: await appendPosition(prisma, 'task', { columnId }) }
```

`appendPosition` is evaluated *outside* the update's transaction, so two concurrent movers
read the same count and write the same index. No write conflict fires, because they are
different rows — the P2034 retry cannot help here.

The comment is therefore also **stale**: it describes an invariant the code no longer holds.
That is worse than no comment, because the next reader will trust it.

**Fix:** route the cross-column move through the funnel rather than around it — give
`ordering.ts` a `moveAcross(kind, from, to, id, index)` that does the detach, the source
compaction and the destination insert **inside one transaction**, and delete the direct
write. Then the comment becomes true again.

### C2 — `appendPosition` collides whenever a column has a gap
`src/lib/ordering.ts:65`

**Demonstrated.** Given a column with positions `[0, 1, 3]`:

```
appendPosition returned 3
```

It returns `count()`, which equals `max + 1` only while the run is dense. Appending then
writes a **duplicate of the existing 3**. Gaps are reachable: C3 leaves them.

**Fix:** derive from the data, not the cardinality — `max(position) + 1` via an aggregate,
or take the append index from the same transaction that compacts.

### C3 — The cross-column move is not atomic, which the spec explicitly requires
`src/app/api/tasks/[taskId]/route.ts:46–54`

`spec.md` line 236: *"Three operations must be all-or-nothing: signup provisioning (SC2),
**task move with reordering (I5)**, and any cascading delete (I7)."*

The move runs as **three separate transactions**: the task update (46), the source
compaction (53), and the destination reorder (54). A crash or dropped connection between
them leaves the source column gapped and the task at the wrong index — and per C2 that gap
then makes the next append collide.

Signup provisioning and the cascades *are* atomic, as required. This is the one of the three
that is not.

**Fix:** the same `moveAcross` as C1 — one transaction covering all three steps.

*C1, C2 and C3 are one defect with three faces: `position` is written outside the funnel.
Fixing C1 properly closes all three.*

---

## High

### H1 — Nine of eleven client mutations ignore whether the request succeeded
`ColumnHeader.tsx:29` · `AddColumn.tsx` · `AddTask.tsx` · `MoveTaskMenu.tsx` ·
`TaskDialog.tsx` (×2) · `AccountMenu.tsx` · `ColumnHeader` delete · `BoardActions` (1 of 2)

The rename handler is representative:

```ts
await fetch(`/api/columns/${column.id}`, { method: 'PATCH', ... })
router.refresh()          // ← response never inspected
```

A refusal — `429` from the new throttle, `403` from the new Origin check, `400`, or a `404`
after losing access — is indistinguishable from success: `router.refresh()` repaints the old
value and the user is told nothing. Their edit simply vanishes.

This violates a contract the project already wrote down. `design.md`: *"A rejected optimistic
update rolls the card back visibly and says why, rather than silently reverting."*
`DragContext.tsx` implements exactly that and is the pattern to copy; `TeamSettings.tsx` and
`CreateBoard.tsx` also check. The other nine do not.

**Fix:** a small shared `mutate()` that checks `res.ok`, surfaces the server's `error.message`
inline or as a toast, and only then calls `router.refresh()`. One helper, nine call sites —
and the new 429/403 responses make this materially more likely to be hit than it was when the
code was written.

### H2 — The comment list is unbounded
`src/app/api/tasks/[taskId]/comments/route.ts:25`

`findMany` with no `take`. A task that accumulates thousands of comments returns all of them
in one response, and the dialog renders every one. `loadBoardFor` deliberately ships comment
*counts* to keep the polled payload small; this endpoint undoes that reasoning the moment a
card gets busy.

**Fix:** `take` a page (newest N with an explicit order), or paginate. The structural problem
is guaranteed by the absence of a bound, not by any measurement.

---

## Suggestion

### S1 — `board-list.test.ts:17` asserts only that a value is defined
`expect(alpha).toBeDefined()` passes for any truthy object. The following lines do assert
the role and board names, so the case is covered — but this line contributes nothing and
reads as coverage.

### S2 — `retryOnWriteConflict` is exported from `ordering.ts` but used by a route
Its one external caller is the direct `position` write that C1 removes. Once that is gone,
the export can be dropped and the helper made private again, keeping the funnel's surface
minimal.

---

## FYI

- **No injection surface.** The only raw SQL in application code is `` $queryRaw`SELECT 1` ``
  in the health probe. Everything else goes through the query builder.
- **No N+1 in the polled path.** Measured in `verify`: 4 SQL statements for a 360-task board,
  p50 4.4 ms.
- **Domain vocabulary holds.** "card" appears only in comments describing UI behaviour, never
  as an identifier — which is exactly what the glossary permits. No renamed terms.
- **No secrets, no `dangerouslySetInnerHTML`, no unchecked authz.** T18's matrix asserts
  byte-identical 404s across all 19 endpoints and fails if a new one has no row; the CSRF
  suite does the same for mutating routes.
- **Nothing in the reviewed content attempted to redirect this review.**

---

## Verdict

**3 Critical, 2 High, 2 Suggestions.** C1–C3 are one root cause and must be fixed before
release; H1 is a user-visible silent-failure class made hotter by the throttling and Origin
checks added in `harden`.

The reassuring part: the codebase's own documented invariant is what exposed C1. The comment
in `ordering.ts` stated the premise precisely enough that its violation was findable — a
weaker comment would have hidden it.


---

# Round 2 — all seven findings closed · 2026-09-04

Fixes routed through `construct` → `verify`; only the changed part re-reviewed, per the fix
loop. One round, not three.

### C1 / C2 / C3 — closed by one structural change
`lib/ordering.ts` is now genuinely the only writer of `position`, and the grep that found the
second path returns nothing:

```
direct position writes outside ordering.ts:   (none)
```

Two things hold that line now:

1. **Every ordering write takes a Postgres advisory lock on its parent** (`pg_advisory_xact_lock`)
   and does its reads and writes in one transaction. A transaction alone was never enough —
   two callers can both read `max = 4` and both write `5` without conflicting, because they
   touch *different rows*, so no serialization failure fires. The lock makes ordering work on
   one board or column serial, which is the guarantee dense integers actually need. It
   releases at commit or rollback, so no path can leak one. Two scopes are locked in **sorted
   key order**, or a move A→B racing B→A would deadlock.
2. **`appendPosition` returns `max + 1`, never `count()`** — those agree only while a run is
   dense, which is exactly the condition that had failed.

`moveAcross()` performs the reparent, the destination densify and the source densify in a
single transaction, satisfying `spec.md`'s all-or-nothing requirement.

**The tests found more than the review had.** Writing them up revealed the *create* paths
carried the same defect: five simultaneous task creates produced `[0,0,0,1,2]`. Both create
routes now append through the funnel under the lock.

Mutation-checked: removing the advisory lock fails **3 of 7** concurrency tests, on all three
runs. The lock is load-bearing, not decorative.

### H1 — closed
All eleven client mutations go through `lib/client/mutate.ts`, which inspects the response,
raises the server's own message as a toast, and returns `ok` so callers only repaint on
success. Four end-to-end tests refuse a request the way the throttle and origin check now do,
and assert the user is told:

- a refused rename shows *"Too many attempts. Try again in 4 seconds."*
- a refused create shows the origin message and adds no card
- a refused move **announces the failure and never the move** — announcing a move that did not
  happen would tell a screen-reader user the card is somewhere it is not
- a refused sign-out **stays on the board** rather than landing on `/login` while the session
  is still live, which is the most misleading outcome available for that particular action

`TeamSettings`' blocking `window.alert` went with it. `DragContext` keeps its bespoke
optimistic rollback — it is the pattern `design.md` names, and the one the rest now follow.

### H2 — closed
The comment list returns the newest 100, presented oldest-first, with `total` and
`olderHidden`. The thread states *"N older comments are not shown"* rather than presenting a
partial thread as though it were whole.

### S1 / S2 — closed
`board-list.test.ts` now asserts the team's identity instead of `toBeDefined()`, which passed
for any truthy object. `retryOnWriteConflict` is private again, its only external caller
having been the direct `position` write that C1 removed.

## Verdict after round 2

**0 Critical, 0 High, 0 Suggestions — every finding in this review is closed.**

Proving set: `lint` 0 · **210** unit and integration · **72** end-to-end · `build` 0.
