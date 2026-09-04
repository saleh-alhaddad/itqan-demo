# Design — 0001 · Task management app

Distilled UI intent. No mockups or design file were supplied (Q16); the direction is
"shadcn/ui + Tailwind, decisions made here and recorded so they can be overruled".
This file — not a screenshot and not the conversation — is what `construct` builds against
and `inspect` reviews against.

## Design system

shadcn/ui (Radix primitives, source vendored into the repo) + Tailwind CSS. Chosen because
it is the conventional pairing for a Next.js App Router project, the accessibility
behaviour of dialogs/menus/tooltips comes from Radix rather than being hand-rolled, and
owning the component source means restyling later does not mean replacing a dependency.

### Visual direction (added 2026-09-04)

Direction is taken from `design-refs/board-reference.png`, treated as **direction, not a
pixel target**. What is adopted from it is the *visual language* — soft per-card tinting,
coloured titles, generous radii, roomy density, a structured card with a meta row top and
bottom. What is **not** adopted is everything in that reference that is a capability this
product does not have; those are listed in the appendix as open scope questions and are
deliberately absent from the design below.

The reference is a marketing shot of a different, larger product. Copying its surface
without its features produces a board that looks like it is missing things. Copying its
*language* onto our feature set produces a board that looks intentional.

## Screens

| Screen | Purpose | Notes |
|---|---|---|
| Sign up | Email, password, name → account | On success, provisioning runs and the user is dropped straight onto their starter board (SC1). Never shows an empty state. |
| Log in | Email, password | Includes no "forgot password" link, because there is no reset flow. The absence must be honest — do not render a dead link. |
| Board | The product. Columns left-to-right, cards within them. | The only screen users spend time on. Everything else is in service of it. |
| Task detail | Title, description, due date, assignees, comments | A dialog over the board rather than a route change, so board context is never lost. |
| Team settings | Rename, member list, add by email, remove, delete team | Owner-only controls are hidden from members, not merely disabled. |
| Board list | Boards across the actor's teams, grouped by team | The landing surface once more than one board exists. |

## Layout

- Board is a horizontally scrolling row of fixed-width columns; each column scrolls
  vertically on its own. The page itself does not scroll in both directions at once.
- Persistent top bar: current team switcher, board name, account menu.
- Task detail is a centred modal dialog on desktop, a full-height sheet on mobile.

## States — every list and async surface specifies all four

| State | Treatment |
|---|---|
| Loading | Skeleton cards matching final card geometry, so nothing shifts when data lands. Never a centred spinner on the board — it discards the layout the user is already looking at. Skeletons carry their column's tint at reduced opacity, so the board's colour rhythm is present before the data is. |
| Empty | Distinct per surface and actionable: a board with no columns invites creating one; a column with no tasks shows a quiet inline "add a task"; a team with one member invites adding someone. Never a bare "No data". |
| Error | Inline and retryable at the level that failed — a failed poll must not blank the board the user is reading. Destructive-action failures surface as a toast that names what did not happen. |
| Success | Optimistic for moves and edits, reconciled by the next poll. A rejected optimistic update rolls the card back visibly and says why, rather than silently reverting. |

## Key interactions

- **Move a card**: drag between and within columns. Position persists (SC3).
- **Move a card without a mouse**: every card exposes a "move" action reachable by
  keyboard that opens a column/position picker. This is an equal path, not a degraded
  one — a drag-only board is a defect, not a limitation (see Risks in `spec.md`).
- **Due date**: a date picker on the task; clearable. Rendered on the card as a badge —
  overdue, due-soon (within 2 days), or absent. Colour is never the only signal: the badge
  carries text and an icon, so it survives colour-blindness and greyscale.
- **Destructive actions**: board delete, team delete, task delete, comment delete each
  require a confirmation dialog naming the specific thing and stating that it cannot be
  undone (hard delete, Q14).
- **Add a member**: an email field; a miss renders "No account with that email" beneath
  the field with an explanation that the person must sign up first (SC7).
- **Polling**: silent. No spinner, no flash, no scroll jump. If a card the user is
  dragging changes underneath them, the drag wins until it is released.

## Tokens

Base remains shadcn's neutral set (`--radius: 0.625rem`, Tailwind type/spacing scales). The
reference adds one thing the neutral set has no answer for: **cards carry a soft colour**.

### The accent scale — and what drives it

Five hues, cycled **by column position** (`position % 5`).

Tint is derived from the column rather than assigned per card, at random, or by tag,
because:
- it needs no new field — no data model change, nothing for a user to set;
- it makes a card's column legible while it is being dragged, detached from its rail;
- it visually restates I3 (*a task's column IS its status*) instead of inventing a second
  axis of meaning that would then need explaining;
- it is **stable** — the same card is the same colour on every reload and for every viewer.
  A random or hash-derived tint would flicker between sessions and mean nothing.

Boards with more than five columns repeat hues. That is acceptable: columns are spatially
separated and the tint is never the *only* signal of which column a card is in — the card is
physically inside that column. **The tint is redundant encoding, never sole encoding**,
which is also why it survives greyscale and colour-blindness (verified: the mint tint has
the same luminance as the neutral rail, so in greyscale it simply disappears — and nothing
is lost when it does).

```
                 surface (card bg)          ink (title)
  --tint-1-*     oklch(0.965 0.025 264)     oklch(0.522 0.15 264)   blue
  --tint-2-*     oklch(0.965 0.025 295)     oklch(0.530 0.15 295)   violet
  --tint-3-*     oklch(0.965 0.025 350)     oklch(0.532 0.14 350)   rose
  --tint-4-*     oklch(0.965 0.025  70)     oklch(0.524 0.13  70)   amber
  --tint-5-*     oklch(0.965 0.025 165)     oklch(0.506 0.11 165)   mint

  dark theme     surface oklch(0.285 0.035 h)   ink oklch(0.686–0.696 C h)
```

**Contrast is computed, not estimated.** Every pair above was checked by converting OKLCH →
sRGB → relative luminance → WCAG ratio (converter validated against black-on-white = 21.00).
Each ink/surface pair lands at **5.00–5.04**, deliberately above the 4.5 floor rather than on
it: values sitting exactly at 4.50 fail the moment anyone nudges a lightness.

### A consequence of tinting: the muted token had to change

`--muted-foreground` (`oklch(0.556 0 0)`) clears 4.5:1 on **white** (4.73) but **fails on
every tinted card** (worst case **4.21**). Meta text — assignee names, counts, the due badge's
own label — sits on exactly those surfaces.

```
  --tint-muted-foreground: oklch(0.500 0 0)   /* worst case across the five tints: 5.34 */
  dark:                    oklch(0.708 0 0)   /* worst case: 5.46 — the existing dark token passes as-is */
```

This is the kind of thing that only shows up when the surface stops being white. Adopting the
tint without it would have quietly pushed every card's secondary text below AA.

### Due-date badges, re-derived against five surfaces

The earlier spec of these tokens said "4.5:1 on the card surface". There is now no single card
surface, so they were re-solved against **all five tints simultaneously**:

```
  --overdue    light oklch(0.560 0.17 25)   worst-tint 4.51   on-white 5.07
               dark  oklch(0.680 0.17 25)   worst-tint 4.55
  --due-soon   light oklch(0.545 0.13 70)   worst-tint 4.53   on-white 5.09
               dark  oklch(0.665 0.13 70)   worst-tint 4.52
```

Note `--due-soon` and the amber tint share a hue family, so a due-soon badge on an
amber-tinted card is low-contrast *as a distinction* even though it passes as text. This is
survivable only because the badge already carries **text and an icon** and never relies on
hue — the rule that was written for colour-blindness turns out to also cover a tint clashing
with a badge.

### Radii and elevation

```
  card     --radius-lg   (0.625rem / 10px)   — was rounded-md; the reference is rounder
  column   --radius-xl   (0.875rem / 14px)
  chips    fully rounded (pill)
```

One depth strategy: **flat fills plus a hairline border**. No shadows on resting cards — the
reference gets its separation from colour, not from elevation, and mixing the two is what
makes a board look busy. A shadow appears in exactly one place: a card while it is being
dragged, where it means "this is lifted" rather than decoration.

## Density

The reference is noticeably roomier than the current build. Adopted:

```
  column width          320px      (was 288px)
  column gap            16px
  card padding          14px       (was 12px)
  gap between cards     10px       (was 8px)
  in-card row rhythm    8px between meta row, title, and footer
  column inner padding  12px
```

Rationale: a card is now a three-part object (meta / title / footer) rather than a title with
an afterthought. At 12px padding those three parts crowd; at 14px they read as bands. The
column widens to keep a two-line title from wrapping to three.

## Card anatomy

Top to bottom, mirroring the reference's structure with our own fields:

```
┌─────────────────────────────────────────────┐
│ [drag handle]                    [⋮ menu]   │  meta row   — 20px, muted
│                                             │
│ Title, up to two lines                      │  title      — tint ink, medium
│ Optional description, one line, clamped     │  subtitle   — tint-muted, 12px
│                                             │
│ (avatars)                    [due] [💬 n]   │  footer     — 24px
└─────────────────────────────────────────────┘
```

- **Meta row** — the drag handle and the overflow menu, both muted until hover/focus. The
  reference puts tags here; we have none, so the row is mostly whitespace and gives the title
  room to breathe rather than being padded out with something invented.
- **Title** — the card's only saturated element, in the column's tint ink. Two lines then
  ellipsis.
- **Description** — one clamped line when present, in `--tint-muted-foreground`. The
  reference labels this `Note:`; we render the existing description field, unlabelled,
  because a label on a card is a word that is the same on every card.
- **Footer** — assignee avatars left; due badge and comment count right. Both right-hand
  items are absent, not empty, when they do not apply.
- **Avatars** — overlapping stack, 24px, ring in the card surface colour, max 3 then `+n`.
  **Initials, not photographs**: the data model stores name and email only. Replacing the
  current comma-separated name list, which wraps badly at two names and breaks the card's
  height rhythm.
- **Count chips** — pill, tinted surface a step darker than the card, icon + number. The
  reference uses two such chips; we have one real count (comments) and the due badge.

## Column anatomy

```
  ▸ Column name          n   +   ⋮
```

Caret and count on the left, `+` and overflow on the right. The `+` duplicates the existing
inline "add a task" affordance at the top of the column, where the reference puts it; the
inline one stays, because appending to the end of a long column should not require scrolling
back up. The caret is **decorative-only in this design** — see the appendix.

## Responsive intent

- Desktop is the primary target; the board is a desktop-shaped surface.
- Tablet: columns narrow, horizontal scroll persists.
- Mobile: one column visible at a time with horizontal snap between columns; task detail
  becomes a full-height sheet. Drag-and-drop degrades to the same explicit move control
  the keyboard path uses — which is why that control is specified as an equal path.

## Accessibility notes

- Drag-and-drop has a full keyboard equivalent (above). This is the single most important
  accessibility requirement in this app.
- Focus is trapped in the task dialog and returns to the originating card on close.
- Column and card counts are announced to assistive technology; a card that moves
  announces its new column.
- All interactive controls reach 4.5:1 contrast; the overdue/due-soon distinction never
  relies on hue alone.
- **The card tint is redundant encoding, never sole encoding.** It restates which column a
  card is in; the card is already physically inside that column. It carries no state, no
  priority and no category, so losing it to greyscale, colour-blindness or forced-colours
  mode costs nothing.
- Contrast for every tint pair is computed rather than eyeballed (see Tokens). Text on a
  tinted card uses `--tint-muted-foreground`, not `--muted-foreground`, because the neutral
  token drops to 4.21 on these surfaces.
- Forced-colours / high-contrast mode: tints are dropped entirely and cards fall back to the
  system canvas with a border. Nothing is lost, per the redundancy rule above.
- Every icon-only button carries an accessible name.

---

# Appendix — in the reference, NOT adopted

**Nothing in this appendix is part of the design above.** Each item is a *capability* the
reference product has and this one does not. They are recorded here so the next reader knows
they were seen and consciously declined, not missed — and so the decision has one place to
live if it is ever revisited.

**These are scope questions, not design work.** Adopting any of them means amending
`spec.md`, which is a gated artifact — not a change `design` or `construct` may make.

| # | In the reference | Status in `spec.md` | What adopting it would actually cost |
|---|---|---|---|
| B1 | **Tags / labels** — `#website`, `#client` pills on every card | Explicitly excluded: *"Labels, tags, priorities, checklists, subtasks…"* | New entity + join table, per-board tag management UI, filtering expectations that follow immediately. The reference's whole card layout is built around this row. |
| B2 | **Progress bar + percentage** — `Progress 40%` with a segmented pip bar | Not in the spec in any form | Needs a source of truth. Either a manual per-task number (a field users must maintain, which goes stale) or derived from checklists (B3), which are themselves excluded. |
| B3 | **Checklists / subtasks** — ticked items inside a card | Explicitly excluded | New entity, ordering, its own completion semantics. Also the only honest source for B2. |
| B4 | **Attachment count** — paperclip + number | Excluded: *"attachments, file uploads"* | File storage, upload limits, virus scanning, a storage bill, and a deletion story for hard-deleted tasks. The single largest item here. |
| B5 | **Image thumbnails on cards** — an embedded screenshot | Excluded (same line as B4) | All of B4, plus thumbnailing and a card layout that must survive a missing/broken image. |
| B6 | **Global search** — "Find something" | Excluded: *"Filtering, search, saved views, calendar view, cross-board views"* | Cross-board query scoped by membership, and a result surface. |
| B7 | **Sidebar app nav** — Dashboard, Schedule, Note, Products, Report, Clients, Support | Excluded: *"Admin console, analytics, or reporting"*; Schedule ≈ *"calendar view"* | These are seven other products. The reference is a suite; this is one board app. |
| B8 | **Collapsible columns** — the `▸` caret in each column header | Not in the spec | Small, but it is per-user persisted UI state, which this product currently has none of. The caret is drawn in the design above as **decorative only**; it should be dropped rather than shipped inert if this is declined. |
| B9 | **Photo avatars** | Not in the spec — the model stores name and email only | Avatar upload (⊂ B4) or a third-party gravatar-style dependency. The design above uses initials, which needs nothing. |
| B10 | **Times on cards** — *"We have a meeting 2:34 AM"* | Contradicted by the spec: `dueDate` is *"a calendar DATE, never a timestamp"*, deliberately | Timestamps reintroduce the timezone question the spec closed on purpose. Note this is a *contradiction*, not merely an absence. |

**One caveat worth stating plainly.** The reference's cards look rich because they are
carrying B1–B5. Our cards carry a title, maybe a description, assignees, a due date and a
comment count — genuinely less. The design above answers that with **space and typography**
rather than by inventing content: a roomier card with a strong coloured title reads as
deliberate, whereas the same card stuffed with empty affordances reads as unfinished. If the
board still feels thin after this, the honest fix is a scope decision from this table, not
more decoration.
