import { vi } from 'vitest'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

/**
 * Route handlers read the session through `cookies()` from next/headers, which only exists
 * inside a Next request context. Tests drive that one seam directly rather than spinning up
 * a server: everything below the cookie read — the guards, the queries, the error contract —
 * is the real production code path.
 */
let currentToken: string | null = null

export function signedInAs(token: string | null) {
  currentToken = token
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && currentToken ? { name, value: currentToken } : undefined,
  }),
}))
