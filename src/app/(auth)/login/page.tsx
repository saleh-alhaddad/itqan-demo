'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * Log in.
 *
 * There is deliberately NO "forgot password" link: the MVP ships no email, so no reset
 * flow exists. Rendering a dead link would be a lie the user only discovers after
 * trusting it, so the absence is stated plainly instead.
 */
export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
      }),
    })

    if (!res.ok) {
      setError('Email or password is incorrect.')
      setPending(false)
      return
    }
    router.push('/boards')
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email"
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none" />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password"
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none" />
        </div>

        {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        No account?{' '}
        <Link href="/signup" className="text-foreground underline underline-offset-4">Sign up</Link>
      </p>
    </main>
  )
}
