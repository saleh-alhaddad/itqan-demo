'use client'

import { toast } from 'sonner'

/**
 * The one way a client component changes server state.
 *
 * A review found nine of eleven mutation call sites firing a request and calling
 * `router.refresh()` without ever inspecting the response. A refusal — `429` from the login
 * throttle, `403` from the cross-origin check, `400`, or `404` after losing access — was
 * indistinguishable from success: the refresh repainted the old value and the user was told
 * nothing. Their edit simply vanished.
 *
 * `design.md` already required the opposite: *"A rejected optimistic update rolls the card
 * back visibly and says why, rather than silently reverting."* One component did that; this
 * makes it the default everywhere.
 *
 * The message comes from the server's own error contract (`{ error: { code, message } }`),
 * so the user reads what actually happened — "Too many attempts. Try again in 4 seconds." —
 * instead of a generic failure.
 */
export type MutateResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number }

export async function mutate<T = unknown>(
  url: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<MutateResult<T>> {
  const { body, headers, ...rest } = init

  let res: Response
  try {
    res = await fetch(url, {
      ...rest,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // The network failed outright — still a failure the user must see, not a silent no-op.
    const message = 'Could not reach the server. Your change was not saved.'
    toast.error(message)
    return { ok: false, message, status: 0 }
  }

  if (!res.ok) {
    const parsed = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const message = parsed?.error?.message ?? 'That did not work. Your change was not saved.'
    toast.error(message)
    return { ok: false, message, status: res.status }
  }

  const data = (await res.json().catch(() => null)) as T
  return { ok: true, data }
}
