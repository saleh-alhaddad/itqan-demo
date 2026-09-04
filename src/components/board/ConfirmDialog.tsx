'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/**
 * The one confirmation used by every destructive action.
 *
 * Deletion in this product is permanent — there is no soft delete, no trash and no undo
 * (Q14) — so the dialog has two jobs: name the specific thing, and state what ELSE goes
 * with it. `consequence` is how a cascade becomes visible: a column delete that silently
 * takes eight tasks with it is exactly the surprise I7 exists to prevent.
 *
 * Shared rather than copied so the wording of "this cannot be undone" cannot drift between
 * the five places that need it.
 */
export function ConfirmDialog({
  open, onOpenChange, title, consequence, confirmLabel = 'Delete', onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  consequence?: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
}) {
  const [pending, setPending] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {consequence ? `${consequence} ` : ''}This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try { await onConfirm() } finally { setPending(false) }
            }}
          >
            {pending ? 'Deleting…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
