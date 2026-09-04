'use client'

import { createContext, useCallback, useContext, useState } from 'react'

/**
 * One live region for the whole board.
 *
 * It cannot live inside the card it describes: moving a card re-parents its React subtree,
 * so a live region owned by the card is destroyed by the very action it was meant to
 * announce. That was a real bug here — the announcement never survived the move. The region
 * has to sit above everything that moves.
 *
 * `aria-live="polite"` rather than assertive: a move is a confirmation, not an emergency,
 * and it should not interrupt whatever the user is reading.
 */
const AnnounceContext = createContext<(message: string) => void>(() => {})

export const useAnnounce = () => useContext(AnnounceContext)

export function BoardAnnouncer({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('')

  const announce = useCallback((next: string) => {
    // Blank first so an identical consecutive message is still read out: assistive tech
    // announces changes, and setting the same string twice is not a change.
    setMessage('')
    requestAnimationFrame(() => setMessage(next))
  }, [])

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p role="status" aria-live="polite" className="sr-only" data-testid="board-announcer">
        {message}
      </p>
    </AnnounceContext.Provider>
  )
}
