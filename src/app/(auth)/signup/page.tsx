'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * Signup. On success the user goes straight to their starter board — there is no setup
 * step and no empty state, which is the product promise SC1 encodes.
 */
export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        name: String(form.get('name') ?? ''),
      }),
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      setError(body?.error?.message ?? 'Something went wrong. Please try again.')
      setPending(false)
      return
    }

    const { boardId } = (await res.json()) as { boardId: string }
    router.push(`/boards/${boardId}`)
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground text-sm">You&rsquo;ll land on a board straight away.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">Name</label>
          <input id="name" name="name" required autoComplete="name"
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none" />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email"
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none" />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password"
            aria-describedby="password-hint"
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none" />
          <p id="password-hint" className="text-muted-foreground text-xs">
            At least 12 characters. There is no password reset, so store it somewhere safe.
          </p>
        </div>

        {/* Errors are announced, not merely coloured. */}
        {error ? (
          <p role="alert" className="text-destructive text-sm">{error}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className="text-foreground underline underline-offset-4">Log in</Link>
      </p>
    </main>
  )
}
