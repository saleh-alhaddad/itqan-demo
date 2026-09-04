'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * Rename and delete, in the board header.
 *
 * Delete is shown only to a team owner — hidden rather than disabled, matching the rest of
 * the product. The server refuses a member regardless, which is the actual boundary.
 */
export function BoardActions({
  boardId, name, taskCount, viewerIsOwner,
}: {
  boardId: string
  name: string
  taskCount: number
  viewerIsOwner: boolean
}) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function rename(next: string) {
    const trimmed = next.trim()
    setRenaming(false)
    if (!trimmed || trimmed === name) return
    await fetch(`/api/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    router.refresh()
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {renaming ? (
        <Input
          autoFocus
          defaultValue={name}
          aria-label="Board name"
          className="h-8 w-64"
          onBlur={(e) => void rename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void rename(e.currentTarget.value)
            if (e.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <>
          <h1 className="truncate text-lg font-semibold">{name}</h1>
          <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>Rename</Button>
        </>
      )}

      {viewerIsOwner && !renaming ? (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirming(true)}>
          Delete board
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${name}”?`}
        // The cascade, stated. I7: a delete the user cannot see coming is the one that surprises.
        consequence={
          taskCount === 0
            ? 'This board has no tasks.'
            : `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} on this board, and their comments, will be deleted too.`
        }
        confirmLabel="Delete board"
        onConfirm={async () => {
          const res = await fetch(`/api/boards/${boardId}`, { method: 'DELETE' })
          setConfirming(false)
          if (res.ok) router.push('/boards')
        }}
      />
    </div>
  )
}
