'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Create a board inside a team. Any member may (SC6 — only deletion is owner-only). */
export function CreateBoard({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function create(name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setOpen(false); return }
    setPending(true)
    const res = await fetch(`/api/teams/${teamId}/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    setPending(false)
    setOpen(false)
    if (res.ok) {
      const board = (await res.json()) as { id: string }
      // Straight into the new board: it already has its columns, so there is nothing to set up.
      router.push(`/boards/${board.id}`)
    }
  }

  if (open) {
    return (
      <Input
        autoFocus
        disabled={pending}
        placeholder="Board name"
        aria-label={`New board in ${teamName}`}
        className="h-9 max-w-xs"
        onBlur={(e) => void create(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create(e.currentTarget.value)
          if (e.key === 'Escape') setOpen(false)
        }}
      />
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      New board
    </Button>
  )
}
