'use client'

import { useEffect, useState } from 'react'
import { POLL_INTERVAL_MS, shouldPoll } from '@/lib/poll'
import type { Board } from './types'

/**
 * Re-fetches an open board every ten seconds (SC10).
 *
 * Deliberately a hook and an interval rather than a data library: the whole requirement is
 * one endpoint on a timer, and a dependency would be more surface than the feature.
 *
 * Two behaviours that are easy to get wrong and matter more than the fetch itself:
 *
 *  - **A failed poll keeps the board already on screen.** It reports the failure inline and
 *    leaves the data alone. Blanking a board someone is reading because one background
 *    request failed is worse than showing data up to ten seconds old — and once this runs
 *    unattended, that failure happens without anyone to react to it.
 *  - **It is silent.** No spinner, no flash. The user is not doing anything, so nothing
 *    should appear to happen except the data being right.
 */
export function useBoardPoll(
  boardId: string,
  initial: Board,
  options: { dragging: boolean },
): { board: Board; stale: boolean } {
  const [board, setBoard] = useState(initial)
  const [stale, setStale] = useState(false)

  // The server is the source of truth: when it hands down new props, they supersede
  // whatever the poll last fetched. Adjusting during render rather than copying the prop,
  // which would freeze the board at mount.
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    setBoard(initial)
    setStale(false)
  }

  const { dragging } = options

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (!shouldPoll({ visibility: document.visibilityState, dragging })) return
      try {
        const res = await fetch(`/api/boards/${boardId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const next = (await res.json()) as Board
        if (!cancelled) { setBoard(next); setStale(false) }
      } catch {
        // Keep what is on screen; say so, quietly.
        if (!cancelled) setStale(true)
      }
    }

    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    // Coming back to a hidden tab should not mean waiting a further ten seconds to see
    // what changed while it was away.
    const onVisible = () => { if (document.visibilityState === 'visible') void tick() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [boardId, dragging])

  return { board, stale }
}
