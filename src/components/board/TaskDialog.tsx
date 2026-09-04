'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'
import type { BoardTask } from './types'

/**
 * Task detail.
 *
 * A dialog OVER the board rather than a route change, so the board stays mounted and its
 * horizontal scroll position survives opening and closing a card (design.md). Radix supplies
 * the focus trap and returns focus to the card that opened it, which is why design.md chose
 * a primitive library rather than hand-rolling this.
 *
 * Later slices extend this dialog rather than replacing it: due date (T11), assignees (T13)
 * and comments (T14).
 */
export function TaskDialog({
  task, open, onOpenChange,
}: {
  task: BoardTask
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save(fields: Record<string, unknown>) {
    setSaving(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">Task details</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="task-title" className="text-sm font-medium">Title</label>
              <Input
                id="task-title"
                defaultValue={task.title}
                disabled={saving}
                // Saved on blur rather than behind a Save button: a dialog that can be
                // dismissed with Escape must not be able to lose typing.
                onBlur={(e) => {
                  const value = e.currentTarget.value.trim()
                  if (value && value !== task.title) void save({ title: value })
                }}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="task-description" className="text-sm font-medium">Description</label>
              <textarea
                id="task-description"
                rows={5}
                defaultValue={task.description ?? ''}
                disabled={saving}
                className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                onBlur={(e) => {
                  const value = e.currentTarget.value.trim()
                  if (value !== (task.description ?? '')) void save({ description: value || null })
                }}
              />
            </div>

            <div className="flex justify-end border-t pt-4">
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
                Delete task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${task.title}”?`}
        consequence={task.commentCount > 0
          ? `${task.commentCount} ${task.commentCount === 1 ? 'comment' : 'comments'} will be deleted too.`
          : undefined}
        onConfirm={async () => {
          await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
          setConfirming(false)
          onOpenChange(false)
          router.refresh()
        }}
      />
    </>
  )
}
