'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from '@/lib/client/mutate'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Adds a column. Rendered both in the column rail and inside the empty-board state, because
 * design.md asks an empty board to INVITE creating a column rather than merely report that
 * there are none.
 */
export function AddColumn({ boardId, variant = 'rail' }: { boardId: string; variant?: 'rail' | 'empty' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function create(name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setOpen(false); return }
    setPending(true)
    const res = await mutate(`/api/boards/${boardId}/columns`, { method: 'POST', body: { name: trimmed } })
    setPending(false)
    setOpen(false)
    if (res.ok) router.refresh()
  }

  if (open) {
    return (
      <div className={variant === 'rail' ? 'w-72 shrink-0' : 'w-72'}>
        <Input
          autoFocus
          disabled={pending}
          placeholder="Column name"
          aria-label="New column name"
          onBlur={(e) => void create(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create(e.currentTarget.value)
            if (e.key === 'Escape') setOpen(false)
          }}
        />
      </div>
    )
  }

  return (
    <Button
      variant={variant === 'rail' ? 'ghost' : 'default'}
      onClick={() => setOpen(true)}
      className={variant === 'rail' ? 'text-muted-foreground w-72 shrink-0 justify-start' : ''}
    >
      <Plus className="size-4" aria-hidden="true" />
      Add column
    </Button>
  )
}
