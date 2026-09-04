'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from '@/lib/client/mutate'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from './ConfirmDialog'
import { DueBadge } from './DueBadge'
import { AssigneePicker } from './AssigneePicker'
import { CommentThread } from './CommentThread'
import type { BoardTask, Member } from './types'

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
  task, members, viewerId, viewerIsOwner, open, onOpenChange,
}: {
  task: BoardTask
  members: Member[]
  viewerId: string
  viewerIsOwner: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  /**
   * In-flight saves, so the dialog cannot be dismissed with an edit still on the wire.
   *
   * Fields save on blur, and nothing awaited that: pressing Escape immediately after typing
   * left a PATCH in flight, and a navigation at that moment cancels it — the edit is
   * silently lost. The comment on the title field claimed a dialog "must not be able to lose
   * typing"; this is what actually makes that true.
   */
  const pending = useRef<Promise<unknown>>(Promise.resolve())

  async function save(fields: Record<string, unknown>) {
    setSaving(true)
    const request = mutate(`/api/tasks/${task.id}`, { method: 'PATCH', body: fields })
      .finally(() => setSaving(false))

    // Chained, not replaced: two fields blurred in quick succession must BOTH be waited on.
    pending.current = pending.current.then(() => request, () => request)
    const res = await request
    if (res.ok) router.refresh()
  }

  /** Closing waits for anything still saving; opening is immediate. */
  async function handleOpenChange(next: boolean) {
    if (!next) await pending.current.catch(() => {})
    onOpenChange(next)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => void handleOpenChange(next)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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

            <div className="space-y-2">
              <span className="text-sm font-medium">Assignees</span>
              <AssigneePicker
                members={members}
                assigned={task.assignees}
                disabled={saving}
                onChange={async (userIds) => {
                  setSaving(true)
                  const res = await mutate(`/api/tasks/${task.id}/assignees`, {
                    method: 'PUT', body: { userIds },
                  })
                  setSaving(false)
                  if (res.ok) router.refresh()
                }}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="task-due" className="text-sm font-medium">Due date</label>
              <div className="flex items-center gap-2">
                <Input
                  id="task-due"
                  type="date"
                  className="w-auto"
                  disabled={saving}
                  defaultValue={asDateInputValue(task.dueDate)}
                  onChange={(e) => {
                    // A date input's empty value is '', which must become null — the API
                    // distinguishes "leave alone" (undefined) from "clear" (null).
                    void save({ dueDate: e.currentTarget.value || null })
                  }}
                />
                {task.dueDate ? (
                  <>
                    <DueBadge dueDate={task.dueDate} />
                    {/* SC4's other half: a due date must be clearable, not just settable. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Clear due date"
                      disabled={saving}
                      onClick={() => void save({ dueDate: null })}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      Clear
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <CommentThread
              taskId={task.id}
              viewerId={viewerId}
              viewerIsOwner={viewerIsOwner}
              open={open}
            />

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
          const res = await mutate(`/api/tasks/${task.id}`, { method: 'DELETE' })
          setConfirming(false)
          if (!res.ok) return
          onOpenChange(false)
          router.refresh()
        }}
      />
    </>
  )
}

/** A DATE column value as the `YYYY-MM-DD` an `<input type="date">` expects. */
function asDateInputValue(due: Date | string | null): string {
  if (!due) return ''
  return typeof due === 'string' ? due.slice(0, 10) : due.toISOString().slice(0, 10)
}
