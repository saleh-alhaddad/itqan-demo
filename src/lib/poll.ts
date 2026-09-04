/**
 * How often an open board re-fetches (SC10).
 *
 * Ten seconds is the spec's committed interval, and up to one interval of staleness is a
 * stated property of the product rather than a defect. SC10's test budget is two intervals
 * plus slack, because a change landing just after a poll cannot be seen until the next one.
 */
export const POLL_INTERVAL_MS = 10_000

/**
 * Whether a poll should run right now.
 *
 * Extracted as a pure function so the policy is testable without a browser, a timer, or a
 * rendered board — the two conditions it encodes are easy to get wrong and invisible when
 * they are buried in a hook.
 */
export function shouldPoll(state: { visibility: DocumentVisibilityState; dragging: boolean }): boolean {
  // A hidden tab must not keep querying: with several boards open in several tabs the cost
  // multiplies for nobody's benefit.
  if (state.visibility !== 'visible') return false
  // The drag wins until released. Re-rendering mid-drag would move the card out from under
  // the pointer, which reads as the application fighting the user.
  if (state.dragging) return false
  return true
}
