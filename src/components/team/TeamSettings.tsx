'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/board/ConfirmDialog'

type Member = { role: 'OWNER' | 'MEMBER'; user: { id: string; name: string; email: string } }

/**
 * Team settings.
 *
 * Owner-only controls are HIDDEN from members rather than disabled (design.md). That is a
 * courtesy; the server check is the security boundary, and it refuses a member regardless of
 * what the client sends.
 */
export function TeamSettings({
  team, viewerRole, viewerId, ownerCount,
}: {
  team: { id: string; name: string; memberships: Member[] }
  viewerRole: 'OWNER' | 'MEMBER'
  viewerId: string
  ownerCount: number
}) {
  const router = useRouter()
  const isOwner = viewerRole === 'OWNER'
  const [addError, setAddError] = useState<string | null>(null)
  const [addPending, setAddPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const email = String(new FormData(form).get('email') ?? '')
    setAddError(null)
    setAddPending(true)

    const res = await fetch(`/api/teams/${team.id}/members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setAddPending(false)

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      // SC7: the miss is stated explicitly, beneath the field, and explains what to do.
      setAddError(body?.error?.message ?? 'Could not add that person.')
      return
    }
    form.reset()
    router.refresh()
  }

  async function call(path: string, init: RequestInit) {
    const res = await fetch(path, init)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      // A refusal names what did not happen, rather than failing silently.
      window.alert(body?.error?.message ?? 'That did not work.')
      return false
    }
    router.refresh()
    return true
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <div>
        {/* Settings must lead back to the boards, or it is a dead end reachable only by
            the browser's back button. */}
        <Link
          href="/boards"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Boards
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{team.name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {team.memberships.length} {team.memberships.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      {isOwner ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Team name</h2>
          <Input
            defaultValue={team.name}
            aria-label="Team name"
            onBlur={(e) => {
              const name = e.currentTarget.value.trim()
              if (name && name !== team.name) {
                void call(`/api/teams/${team.id}`, {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ name }),
                })
              }
            }}
          />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <ul className="divide-y rounded-lg border" data-testid="member-list">
          {team.memberships.map(({ role, user }) => (
            <li key={user.id} className="flex items-center justify-between gap-3 p-3" data-testid="member-row">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-muted-foreground truncate text-xs">{user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground text-xs">{role === 'OWNER' ? 'Owner' : 'Member'}</span>
                {isOwner ? (
                  <>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => void call(`/api/teams/${team.id}/members/${user.id}`, {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ role: role === 'OWNER' ? 'MEMBER' : 'OWNER' }),
                      })}
                    >
                      {role === 'OWNER' ? 'Make member' : 'Make owner'}
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="text-destructive"
                      aria-label={`Remove ${user.name}`}
                      onClick={() => void call(`/api/teams/${team.id}/members/${user.id}`, { method: 'DELETE' })}
                    >
                      Remove
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {/* Stated where the consequence is, not buried in a tooltip. */}
        {isOwner && ownerCount === 1 ? (
          <p className="text-muted-foreground text-xs">
            You are the only owner, so you cannot be removed or demoted. Make someone else an
            owner first, or delete the team.
          </p>
        ) : null}
      </section>

      {isOwner ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Add a member</h2>
          <form onSubmit={addMember} className="flex gap-2">
            <Input name="email" type="email" required placeholder="their@email.example"
              aria-label="Email address" disabled={addPending} />
            <Button type="submit" disabled={addPending}>Add</Button>
          </form>
          {addError ? (
            <p role="alert" className="text-destructive text-sm" data-testid="add-member-error">{addError}</p>
          ) : null}
        </section>
      ) : null}

      {isOwner ? (
        <section className="space-y-2 border-t pt-6">
          <h2 className="text-destructive text-sm font-semibold">Delete this team</h2>
          <p className="text-muted-foreground text-sm">
            Every board in this team, and every task and comment on them, will be deleted.
          </p>
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete team</Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${team.name}”?`}
        consequence="Every board in this team, with all their tasks and comments, will be deleted."
        confirmLabel="Delete team"
        onConfirm={async () => {
          const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' })
          setConfirmDelete(false)
          if (res.ok) router.push('/boards')
        }}
      />
      <span className="sr-only" data-viewer-id={viewerId} />
    </main>
  )
}
