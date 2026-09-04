'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from './ConfirmDialog'
import type { BoardColumn } from './types'

/**
 * Column title plus its rename/delete controls.
 *
 * `router.refresh()` after a mutation re-runs the server component, so the board state has
 * exactly one source — the server — instead of a client copy that can drift from it.
 */
export function ColumnHeader({ column }: { column: BoardColumn }) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const taskCount = column.tasks.length

  async function rename(name: string) {
    const trimmed = name.trim()
    setRenaming(false)
    if (!trimmed || trimmed === column.name) return
    await fetch(`/api/columns/${column.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
      {renaming ? (
        <Input
          autoFocus
          defaultValue={column.name}
          aria-label={`Rename ${column.name}`}
          className="h-7 text-sm"
          onBlur={(e) => void rename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void rename(e.currentTarget.value)
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <h2 className="truncate text-sm font-semibold">{column.name}</h2>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <span className="text-muted-foreground text-xs tabular-nums">{taskCount}</span>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-background/80 rounded p-1"
            // Icon-only control, so it carries its own accessible name.
            aria-label={`Actions for ${column.name}`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${column.name}”?`}
        // The cascade, spelled out. I7: a delete the user cannot see coming is the one
        // that surprises them.
        consequence={
          taskCount === 0
            ? 'This column is empty.'
            : `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} in this column will be deleted too.`
        }
        onConfirm={async () => {
          await fetch(`/api/columns/${column.id}`, { method: 'DELETE' })
          setConfirming(false)
          router.refresh()
        }}
      />
    </header>
  )
}
