'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { mutate } from '@/lib/client/mutate'
import { LogOut, ShieldOff } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/board/ConfirmDialog'

/**
 * The account menu.
 *
 * Until now there was no way to sign out at all — the endpoint existed and nothing called
 * it. "Sign out everywhere" is the user-facing half of the absolute-session work (harden
 * M4): with no password reset in this MVP, revoking every session is the only recovery a
 * person has if they think a cookie was stolen.
 */
export function AccountMenu({ name }: { name: string }) {
  const router = useRouter()
  const [confirmAll, setConfirmAll] = useState(false)

  async function signOut(everywhere: boolean) {
    const res = await mutate('/api/auth/logout', { method: 'POST', body: { everywhere } })
    // Navigating to /login after a failed logout would look signed out while the session
    // is still live — the most misleading possible outcome for this particular action.
    if (res.ok) router.push('/login')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Account menu for ${name}`}
          className="hover:bg-muted focus-visible:ring-ring rounded-full px-2 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {name}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut(false)}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmAll(true)}>
            <ShieldOff className="size-4" aria-hidden="true" />
            Sign out everywhere
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Sign out on every device?"
        consequence="Every browser and device signed in as you will be signed out immediately."
        confirmLabel="Sign out everywhere"
        onConfirm={() => signOut(true)}
      />
    </>
  )
}
