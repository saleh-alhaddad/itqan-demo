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
| Loading | Skeleton cards matching final card geometry, so nothing shifts when data lands. Never a centred spinner on the board — it discards the layout the user is already looking at. |
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

None were supplied, so shadcn's default token set is adopted unmodified for the MVP:
its neutral base palette, `--radius` at the default, Tailwind's default type and spacing
scales. Deliberately unopinionated — a visual identity is worth choosing when there is a
product to dress, and inventing one now would be a decision made on no information.

Semantic additions required by this app:
- `--overdue` and `--due-soon` badge colours, each meeting 4.5:1 contrast on the card
  surface in both light and dark themes.

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
- Every icon-only button carries an accessible name.
