import { describe, it, expect } from 'vitest'
import { POLL_INTERVAL_MS, shouldPoll } from '@/lib/poll'

describe('T17 — polling policy (SC10)', () => {
  it('polls every 10 seconds, the interval the spec commits to', () => {
    expect(POLL_INTERVAL_MS).toBe(10_000)
  })

  it('polls while the tab is visible and the window is focused', () => {
    expect(shouldPoll({ visibility: 'visible', dragging: false })).toBe(true)
  })

  it('PAUSES while the tab is hidden — a background tab must not keep querying', () => {
    expect(shouldPoll({ visibility: 'hidden', dragging: false })).toBe(false)
  })

  it('pauses while a card is being dragged, so the drag wins until released', () => {
    // design.md: "If a card the user is dragging changes underneath them, the drag wins
    // until it is released." Re-rendering mid-drag would snatch the card away.
    expect(shouldPoll({ visibility: 'visible', dragging: true })).toBe(false)
  })

  it('resumes once the drag ends and the tab is visible again', () => {
    expect(shouldPoll({ visibility: 'visible', dragging: false })).toBe(true)
  })
})
