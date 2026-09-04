import type { CSSProperties } from 'react'

/** How many hues the accent scale defines (see design.md → Tokens). */
export const TINT_COUNT = 5

/**
 * Which tint a column gets, from its position.
 *
 * Derived from the COLUMN rather than assigned per card, at random, or by tag:
 *  - it needs no new field, so the data model is untouched;
 *  - it is stable — the same card is the same colour on every reload and for every viewer,
 *    where a random or hash-derived tint would flicker between sessions and mean nothing;
 *  - it keeps a card's column legible while the card is dragged out of its rail;
 *  - it restates that a task's column IS its status, rather than adding a second meaning.
 *
 * Boards with more than five columns repeat hues, which is fine: the tint is redundant
 * encoding — the card is already physically inside its column — never the sole signal.
 *
 * Defensive against a non-integer or negative position. Those cannot occur today (the
 * ordering funnel keeps positions dense from 0) but the failure mode if they ever did is a
 * literal `var(--tint-NaN-surface)` in the markup, which fails silently and looks like a
 * styling bug rather than a data one.
 */
export function tintFor(position: number): number {
  const n = Number.isFinite(position) ? Math.trunc(position) : 0
  return (((n % TINT_COUNT) + TINT_COUNT) % TINT_COUNT) + 1
}

/**
 * The tint as two inherited custom properties, set once on the column element so every card
 * inside it is styled by inheritance — rather than five conditional class sets per card.
 */
export function tintStyle(position: number): CSSProperties {
  const n = tintFor(position)
  return {
    '--tint-surface': `var(--tint-${n}-surface)`,
    '--tint-ink': `var(--tint-${n}-ink)`,
  } as CSSProperties
}
