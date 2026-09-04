'use client'

import { useRouter } from 'next/navigation'
import { mutate } from '@/lib/client/mutate'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'

/**
 * The quiet inline "add a task" a column shows (design.md). Deliberately a single field:
 * the point is to capture a thought without a form in the way; everything else is added
 * afterwards in the detail dialog.
 */
export function AddTask({
  columnId, columnName, open, onOpenChange,
}: {
  columnId: string
  columnName: string
  /** Controlled by the column, so the header's "+" and this inline affordance open the
      same field instead of two competing ones. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const setOpen = onOpenChange

  async function create(title: string) {
    const trimmed = title.trim()
    setOpen(false)
    if (!trimmed) return
    const res = await mutate(`/api/columns/${columnId}/tasks`, { method: 'POST', body: { title: trimmed } })
    if (res.ok) router.refresh()
  }

  if (open) {
    return (
      <Input
        autoFocus
        placeholder="What needs doing?"
        aria-label={`New task in ${columnName}`}
        className="text-sm"
        onBlur={(e) => void create(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create(e.currentTarget.value)
          if (e.key === 'Escape') setOpen(false)
        }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-muted-foreground hover:bg-background/60 hover:text-foreground rounded-md p-2 text-left text-xs transition-colors"
    >
      <Plus className="mr-1 inline size-3" aria-hidden="true" />
      Add a task
    </button>
  )
}
