'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from './ConfirmDialog'

type Comment = {
  id: string
  body: string
  createdAt: string
  authorId: string
  author: { id: string; name: string }
}

/**
 * The comment thread inside the task dialog.
 *
 * Bodies are fetched here rather than carried on the board payload, which is re-polled every
 * ten seconds — shipping every comment with it would grow that response without bound.
 *
 * Comments render as TEXT. React escapes by default, and nothing here opts out with
 * `dangerouslySetInnerHTML`: markdown and rich text are named exclusions, so a body
 * containing markup is shown as the characters the author typed.
 */
export function CommentThread({
  taskId, viewerId, viewerIsOwner, open,
}: {
  taskId: string
  viewerId: string
  viewerIsOwner: boolean
  open: boolean
}) {
  const router = useRouter()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState<Comment | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/comments`, { cache: 'no-store' })
    if (res.ok) setComments((await res.json()) as Comment[])
  }, [taskId])

  /**
   * Fetched when the dialog opens rather than with the board, so a closed card costs nothing.
   *
   * The state is set inside the promise callback, not synchronously in the effect body:
   * this is subscribing to an external system and reacting when it answers, which is what
   * effects are for. A synchronous set here would be a cascading render, and the linter is
   * right to reject it.
   *
   * `cancelled` matters because a dialog can be closed before its comments arrive — writing
   * state into an unmounted thread would be a leak, and worse, a slow response for one task
   * could land after the user opened a different one.
   */
  useEffect(() => {
    if (!open) return
    let cancelled = false

    fetch(`/api/tasks/${taskId}/comments`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setComments(data as Comment[]) })
      .catch(() => { /* a failed load leaves the thread showing its previous state */ })

    return () => { cancelled = true }
  }, [open, taskId])

  async function post(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = String(new FormData(form).get('body') ?? '').trim()
    if (!body) return

    setPending(true)
    await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    setPending(false)
    form.reset()
    await load()
    router.refresh()   // the card's comment count lives on the board payload
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Comments">
      <h3 className="text-sm font-medium">
        Comments{comments ? ` (${comments.length})` : ''}
      </h3>

      {comments === null ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-xs">No comments yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="comment-list">
          {comments.map((c) => {
            // Expressed once, matching the server rule exactly (SC6).
            const mayDelete = c.authorId === viewerId || viewerIsOwner
            return (
              <li key={c.id} className="group flex items-start justify-between gap-2" data-testid="comment">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{c.author.name}</p>
                  {/* whitespace-pre-wrap keeps the author's line breaks without interpreting
                      anything else they typed. */}
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">{c.body}</p>
                </div>
                {mayDelete ? (
                  <Button
                    variant="ghost" size="sm"
                    aria-label={`Delete comment by ${c.author.name}`}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setConfirming(c)}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={post} className="flex gap-2">
        <input
          name="body"
          aria-label="Write a comment"
          placeholder="Write a comment…"
          disabled={pending}
          className="border-input bg-background focus-visible:ring-ring h-9 flex-1 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
        />
        <Button type="submit" size="sm" disabled={pending}>Post</Button>
      </form>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Delete this comment?"
        onConfirm={async () => {
          if (!confirming) return
          await fetch(`/api/comments/${confirming.id}`, { method: 'DELETE' })
          setConfirming(null)
          await load()
          router.refresh()
        }}
      />
    </section>
  )
}
